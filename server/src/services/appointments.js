import { AppError, cleanText } from '../utils/http.js';
import { isValidDate, localDate } from './schedule.js';

export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'missed'];

const SELECT = `
  SELECT a.id, a.patient_id AS patientId, a.scheduled_date AS date, a.scheduled_time AS time,
         a.examination, a.modality, a.status, a.notes, a.grace_alert_sent AS graceAlertSent,
         a.assigned_user_id AS assignedUserId, a.requested_by AS requestedBy,
         a.created_at AS createdAt, a.updated_at AS updatedAt, a.completed_at AS completedAt, a.missed_at AS missedAt,
         p.mrn, p.first_name AS firstName, p.last_name AS lastName,
         COALESCE(assignee.full_name, assignee.username) AS assignedTo,
         requester.username AS requestedByUsername
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  LEFT JOIN users assignee ON assignee.id = a.assigned_user_id
  LEFT JOIN users requester ON requester.id = a.requested_by
`;

export function createAppointmentService(db, { notifications, alerts } = {}) {
  const getById = db.prepare(`${SELECT} WHERE a.id = ?`);

  function get(id) {
    return getById.get(Number(id)) ?? null;
  }

  function requireAppointment(id) {
    const appointment = get(id);
    if (!appointment) {
      throw new AppError('Appointment not found.', 404);
    }
    return appointment;
  }

  function validate(input) {
    const date = String(input.date || '').trim();
    const time = String(input.time || '').trim();
    if (!isValidDate(date)) {
      throw new AppError('Enter a valid appointment date.');
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      throw new AppError('Enter a valid time in HH:MM format.');
    }
    const examination = cleanText(input.examination, 120);
    const modality = String(input.modality || '').trim().toUpperCase();
    if (!examination || !modality) {
      throw new AppError('Examination and modality are required.');
    }
    return {
      date,
      time,
      examination,
      modality,
      notes: cleanText(input.notes, 400) ?? null,
      assignedUserId: input.assignedUserId ? Number(input.assignedUserId) : null,
    };
  }

  function list({ status, dateFrom, dateTo, patientId, limit = 200 } = {}) {
    const clauses = [];
    const params = { limit: Math.min(Math.max(Number(limit) || 200, 1), 500) };
    if (status && status !== 'all') {
      clauses.push('a.status = @status');
      params.status = status;
    }
    if (dateFrom) {
      clauses.push('a.scheduled_date >= @dateFrom');
      params.dateFrom = dateFrom;
    }
    if (dateTo) {
      clauses.push('a.scheduled_date <= @dateTo');
      params.dateTo = dateTo;
    }
    if (patientId) {
      clauses.push('a.patient_id = @patientId');
      params.patientId = Number(patientId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return db
      .prepare(`${SELECT} ${where} ORDER BY a.scheduled_date, a.scheduled_time, a.id LIMIT @limit`)
      .all(params);
  }

  function counts() {
    const rows = db.prepare(`SELECT status, COUNT(*) AS total FROM appointments GROUP BY status`).all();
    const summary = { scheduled: 0, completed: 0, cancelled: 0, missed: 0 };
    for (const row of rows) {
      summary[row.status] = row.total;
    }
    return summary;
  }

  return {
    get,
    list,
    counts,

    create({ patientId, requestedBy, createdBy, ...input }) {
      const patient = db.prepare('SELECT id FROM patients WHERE id = ? AND status = ?').get(Number(patientId), 'active');
      if (!patient) {
        throw new AppError('Patient not found or archived.', 404);
      }
      const entry = validate(input);
      const result = db
        .prepare(
          `INSERT INTO appointments (
             patient_id, scheduled_date, scheduled_time, examination, modality,
             assigned_user_id, requested_by, notes, created_by, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .run(
          patient.id,
          entry.date,
          entry.time,
          entry.examination,
          entry.modality,
          entry.assignedUserId,
          requestedBy ?? null,
          entry.notes,
          createdBy ?? null,
        );
      return get(result.lastInsertRowid);
    },

    setStatus(id, status, actorId) {
      const appointment = requireAppointment(id);
      if (!APPOINTMENT_STATUSES.includes(status)) {
        throw new AppError('Invalid appointment status.');
      }
      if (appointment.status === 'cancelled' && status !== 'cancelled') {
        throw new AppError('Cancelled appointments cannot be reopened.', 409);
      }
      const extra =
        status === 'completed'
          ? `, completed_at = datetime('now')`
          : status === 'missed'
            ? `, missed_at = datetime('now')`
            : '';
      db.prepare(`UPDATE appointments SET status = ?, updated_at = datetime('now')${extra} WHERE id = ?`).run(status, appointment.id);

      if (status === 'missed' && notifications) {
        notifications.notifyRole('administrator', {
          type: 'missed_appointment',
          title: 'Missed appointment',
          message: `${appointment.firstName} ${appointment.lastName} missed ${appointment.examination} on ${appointment.date}.`,
          resourceType: 'appointment',
          resourceId: appointment.id,
        });
        alerts?.raise({
          type: 'no_show',
          description: `Missed appointment ${appointment.id} for ${appointment.firstName} ${appointment.lastName}.`,
          resource: `appointment:${appointment.id}`,
          dedupeMinutes: 60,
        });
      }

      if (status === 'cancelled' && notifications) {
        notifications.notifyRole('administrator', {
          type: 'cancelled_appointment',
          title: 'Appointment cancelled',
          message: `Appointment ${appointment.id} (${appointment.examination}) was cancelled.`,
          resourceType: 'appointment',
          resourceId: appointment.id,
        });
      }

      void actorId;
      return get(appointment.id);
    },

    processOverdue() {
      const today = localDate();
      const overdue = db
        .prepare(
          `SELECT id FROM appointments
           WHERE status = 'scheduled' AND (scheduled_date < @today OR (scheduled_date = @today AND scheduled_time < @now))`,
        )
        .all({ today, now: new Date().toTimeString().slice(0, 5) });

      for (const row of overdue) {
        this.setStatus(row.id, 'missed', null);
      }

      const graceDue = db
        .prepare(
          `SELECT a.id, p.first_name AS firstName, p.last_name AS lastName, a.examination, a.scheduled_date AS date
           FROM appointments a
           JOIN patients p ON p.id = a.patient_id
           WHERE a.status = 'missed'
             AND a.grace_alert_sent = 0
             AND datetime(a.scheduled_date || ' ' || a.scheduled_time) <= datetime('now', '-2 days')`,
        )
        .all();

      for (const row of graceDue) {
        notifications?.notifyRole('administrator', {
          type: 'unattended_grace',
          title: 'Unattended appointment (2-day grace elapsed)',
          message: `${row.firstName} ${row.lastName}: ${row.examination} on ${row.date} remains unattended after the two-day grace period.`,
          resourceType: 'appointment',
          resourceId: row.id,
        });
        alerts?.raise({
          type: 'no_show',
          description: `Two-day grace elapsed for unattended appointment ${row.id} (${row.firstName} ${row.lastName}).`,
          resource: `appointment-grace:${row.id}`,
        });
        db.prepare(`UPDATE appointments SET grace_alert_sent = 1 WHERE id = ?`).run(row.id);
      }

      return { markedMissed: overdue.length, graceAlerts: graceDue.length };
    },
  };
}
