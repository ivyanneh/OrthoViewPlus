import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { AUDIT_CATEGORIES } from '../services/audit.js';
import { ALERT_TYPES } from '../services/alerts.js';
import { MIN_PASSWORD_LENGTH, ROLES, UserError } from '../services/users.js';
import { MODALITIES, SCHEDULE_STATUSES, ScheduleError, isValidDate, localDate } from '../services/schedule.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageInfo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
const startedAt = new Date();

function handle(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof UserError || error instanceof ScheduleError) {
        return res.status(error.status).json({ error: error.message });
      }
      return next(error);
    }
  };
}

function requestDate(value) {
  return isValidDate(value) ? value : localDate();
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDate(value);
}

function roleLabel(role) {
  return role === 'administrator' ? 'Administrator' : 'Healthcare Practitioner';
}

function splitModalities(value) {
  return String(value || '')
    .split(/[\\,]\s*/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

export function createAdminRouter({ db, audit, users, schedule, alerts, orthanc }) {
  const router = Router();

  function log(req, action, target, description) {
    audit.log({ userId: req.user?.id ?? null, action, target, description: `User "${req.user?.username ?? 'unknown'}" ${description}` });
  }

  async function orthancSnapshot() {
    try {
      const health = await orthanc.getHealth();
      if (!health.connected) {
        return { ...health, studies: null, series: null, instances: null };
      }
      const counts = await orthanc.getConnectionSummary();
      return { ...health, ...counts };
    } catch {
      return { connected: false, status: 'Orthanc unavailable', studies: null, series: null, instances: null };
    }
  }

  router.get(
    '/meta',
    handle((_req, res) => {
      res.json({
        roles: ROLES.map((value) => ({ value, label: roleLabel(value) })),
        modalities: MODALITIES.map(({ code, label }) => ({ code, label })),
        scheduleStatuses: SCHEDULE_STATUSES.map((value) => ({ value, label: schedule.statusLabel(value) })),
        alertTypes: ALERT_TYPES,
        auditCategories: Object.keys(AUDIT_CATEGORIES),
        minPasswordLength: MIN_PASSWORD_LENGTH,
      });
    }),
  );

  // ---------- Overview ----------
  router.get(
    '/overview',
    handle(async (req, res) => {
      const date = requestDate(req.query.date);
      log(req, 'view_admin_dashboard', 'admin_dashboard', 'viewed the administrator dashboard.');

      const allUsers = users.list();
      const current = allUsers.filter((user) => user.status !== 'removed');

      res.json({
        date,
        users: {
          total: current.length,
          administrators: current.filter((user) => user.role === 'administrator').length,
          activePractitioners: current.filter(
            (user) => user.role === 'practitioner' && user.status === 'active' && !user.restricted,
          ).length,
          inactive: current.filter((user) => user.status === 'inactive').length,
          restricted: current.filter((user) => user.restricted).length,
        },
        schedule: {
          summary: schedule.summaryForDate(date),
          today: schedule.list({ dateFrom: date, dateTo: date }),
          totalEntries: schedule.count(),
        },
        alerts: alerts.list({ limit: 6 }),
        recentAudit: audit.list({ limit: 8 }).entries,
        modalities: schedule.modalityBreakdown({ date, dateFrom: shiftDate(date, -29), dateTo: date }),
        orthanc: await orthancSnapshot(),
      });
    }),
  );

  // ---------- Users ----------
  router.get(
    '/users',
    handle((req, res) => {
      log(req, 'view_user_management', 'user_management', 'viewed user management.');
      res.json({ users: users.list() });
    }),
  );

  router.post(
    '/users',
    handle((req, res) => {
      const body = req.body || {};
      const user = users.create({
        username: body.username,
        password: body.password,
        role: body.role,
        fullName: body.fullName,
        email: body.email,
        department: body.department,
      });
      log(req, 'user_create', `user:${user.username}`, `created ${roleLabel(user.role)} account "${user.username}".`);
      res.status(201).json({ user });
    }),
  );

  router.patch(
    '/users/:id',
    handle((req, res) => {
      const body = req.body || {};
      const result = users.update(
        req.params.id,
        {
          fullName: body.fullName,
          email: body.email,
          department: body.department,
          role: body.role,
          password: body.password,
        },
        req.user.id,
      );
      const target = `user:${result.user.username}`;
      log(req, 'user_update', target, `updated account details for "${result.user.username}".`);
      if (result.roleChanged) {
        log(
          req,
          'user_role_change',
          target,
          `changed role of "${result.user.username}" from ${roleLabel(result.before.role)} to ${roleLabel(result.user.role)}.`,
        );
      }
      if (result.passwordChanged) {
        log(req, 'user_password_reset', target, `reset the password for "${result.user.username}".`);
      }
      res.json({ user: result.user });
    }),
  );

  function statusRoute(status, action, verb) {
    return handle((req, res) => {
      const user = users.setStatus(req.params.id, status, req.user.id);
      log(req, action, `user:${user.username}`, `${verb} account "${user.username}".`);
      if (status !== 'active') {
        alerts.raise({ type: 'access', description: `Account "${user.username}" was ${verb} by ${req.user.username}.`, resource: `user:${user.username}` });
      }
      res.json({ user });
    });
  }

  router.post('/users/:id/activate', statusRoute('active', 'user_activate', 'activated'));
  router.post('/users/:id/deactivate', statusRoute('inactive', 'user_deactivate', 'deactivated'));
  // Accounts are archived rather than deleted so historical audit records keep their user reference.
  router.delete('/users/:id', statusRoute('removed', 'user_remove', 'removed'));

  router.post(
    '/users/:id/restrict',
    handle((req, res) => {
      const reason = String(req.body?.reason || '').trim();
      if (!reason) {
        return res.status(400).json({ error: 'A restriction reason is required.' });
      }
      const user = users.setRestriction(req.params.id, true, reason, req.user.id);
      log(req, 'user_restrict', `user:${user.username}`, `restricted sign-in for "${user.username}". Reason: ${user.restrictionReason}`);
      alerts.raise({
        type: 'access',
        description: `Sign-in restricted for "${user.username}" by ${req.user.username}.`,
        resource: `user:${user.username}`,
      });
      return res.json({ user });
    }),
  );

  router.post(
    '/users/:id/unrestrict',
    handle((req, res) => {
      const user = users.setRestriction(req.params.id, false, null, req.user.id);
      log(req, 'user_unrestrict', `user:${user.username}`, `removed sign-in restriction for "${user.username}".`);
      res.json({ user });
    }),
  );

  // ---------- Imaging schedule ----------
  router.get(
    '/schedule',
    handle((req, res) => {
      const entries = schedule.list({
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        modality: req.query.modality,
        status: req.query.status,
      });
      const practitioners = users
        .list()
        .filter((user) => user.role === 'practitioner' && user.status === 'active')
        .map((user) => ({ id: user.id, name: user.fullName || user.username, username: user.username }));
      res.json({ entries, practitioners });
    }),
  );

  router.post(
    '/schedule',
    handle((req, res) => {
      const { entry, conflicts } = schedule.create(req.body || {}, req.user.id);
      log(req, 'schedule_create', `schedule #${entry.id}`, `scheduled ${entry.examination} (${entry.modality}) for ${entry.date} ${entry.time}.`);
      res.status(201).json({ entry, conflicts });
    }),
  );

  router.patch(
    '/schedule/:id',
    handle((req, res) => {
      const { entry, conflicts } = schedule.update(req.params.id, req.body || {});
      log(req, 'schedule_update', `schedule #${entry.id}`, `updated ${entry.examination} (${entry.modality}) for ${entry.date} ${entry.time}.`);
      res.json({ entry, conflicts });
    }),
  );

  router.post(
    '/schedule/:id/status',
    handle((req, res) => {
      const { before, entry } = schedule.setStatus(req.params.id, String(req.body?.status || ''));
      log(
        req,
        'schedule_status_change',
        `schedule #${entry.id}`,
        `changed ${entry.examination} (${entry.modality}) from ${schedule.statusLabel(before.status)} to ${schedule.statusLabel(entry.status)}.`,
      );
      res.json({ entry });
    }),
  );

  // ---------- Alerts ----------
  router.get(
    '/alerts',
    handle((req, res) => {
      log(req, 'view_alerts', 'alerts', 'viewed administrative alerts.');
      res.json(alerts.list({ status: req.query.status, type: req.query.type, limit: 500 }));
    }),
  );

  router.post(
    '/alerts/:id/review',
    handle((req, res) => {
      const alert = alerts.get(req.params.id);
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found.' });
      }
      if (alerts.review(alert.id, req.user.id)) {
        log(req, 'alert_review', `alert #${alert.id}`, `marked alert #${alert.id} (${alert.type}) as reviewed.`);
      }
      return res.json({ alert: alerts.get(alert.id) });
    }),
  );

  // ---------- Modality monitoring ----------
  router.get(
    '/modalities',
    handle(async (req, res) => {
      const date = requestDate(req.query.date);
      log(req, 'view_modality_monitoring', 'modality_monitoring', 'viewed modality monitoring.');

      const breakdown = schedule.modalityBreakdown({ date, dateFrom: shiftDate(date, -29), dateTo: date });
      const status = await orthancSnapshot();
      let archive = null;

      if (status.connected) {
        const studies = await orthanc.listStudies({ limit: 200 });
        const counts = {};
        for (const study of studies) {
          for (const code of new Set(splitModalities(study.modalitiesInStudy))) {
            counts[code] = (counts[code] || 0) + 1;
          }
        }
        archive = {
          sampled: studies.length,
          byModality: Object.fromEntries(
            MODALITIES.map((item) => [item.code, item.dicom.reduce((sum, code) => sum + (counts[code] || 0), 0)]),
          ),
        };
      }

      res.json({ date, period: { from: shiftDate(date, -29), to: date }, modalities: breakdown, orthanc: status, archive });
    }),
  );

  // ---------- System ----------
  router.get(
    '/system',
    handle(async (req, res) => {
      log(req, 'view_system_administration', 'system_administration', 'viewed system administration.');

      const count = (table) => db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total;
      let database;
      try {
        database = {
          connected: true,
          engine: 'SQLite',
          version: db.prepare('SELECT sqlite_version() AS version').get().version,
          journalMode: db.pragma('journal_mode', { simple: true }),
          integrity: db.pragma('quick_check', { simple: true }),
          records: {
            users: count('users'),
            auditLogs: count('audit_logs'),
            scheduleEntries: count('imaging_schedule'),
            alerts: count('alerts'),
          },
        };
      } catch {
        database = { connected: false, engine: 'SQLite' };
      }

      const allUsers = users.list();
      res.json({
        application: {
          name: 'OrthoView+',
          version: packageInfo.version,
          runtime: `Node.js ${process.version}`,
          startedAt: startedAt.toISOString(),
          uptimeSeconds: Math.round(process.uptime()),
        },
        database,
        orthanc: await orthancSnapshot(),
        access: {
          roles: ROLES.map((value) => ({
            value,
            label: roleLabel(value),
            active: allUsers.filter((user) => user.role === value && user.status === 'active').length,
          })),
          restrictedAccounts: allUsers.filter((user) => user.restricted && user.status !== 'removed').length,
          inactiveAccounts: allUsers.filter((user) => user.status === 'inactive').length,
          minPasswordLength: MIN_PASSWORD_LENGTH,
        },
      });
    }),
  );

  return router;
}
