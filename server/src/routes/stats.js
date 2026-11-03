import { Router } from 'express';
import { handleRoute } from '../utils/http.js';

export function createStatsRouter({ db, users, patients, appointments, orthanc, audit }) {
  const router = Router();

  router.get(
    '/',
    handleRoute(async (req, res) => {
      audit.log({
        userId: req.user.id,
        action: 'view_system_statistics',
        target: 'statistics',
        description: `User "${req.user.username}" viewed system statistics.`,
      });
      const allUsers = users.list().filter((user) => user.status !== 'removed');
      res.json({
        users: {
          total: allUsers.length,
          administrators: allUsers.filter((user) => user.role === 'administrator').length,
          practitioners: allUsers.filter((user) => user.role === 'practitioner').length,
          radiologists: allUsers.filter((user) => user.role === 'radiologist').length,
        },
        patients: { total: patients.count() },
        appointments: appointments.counts(),
        requests: db
          .prepare(`SELECT status, COUNT(*) AS total FROM imaging_requests GROUP BY status`)
          .all(),
        reports: {
          draft: db.prepare(`SELECT COUNT(*) AS total FROM radiology_reports WHERE status = 'draft'`).get().total,
          approved: db.prepare(`SELECT COUNT(*) AS total FROM radiology_reports WHERE status = 'approved'`).get().total,
        },
        aiJobs: db.prepare(`SELECT status, COUNT(*) AS total FROM ai_jobs GROUP BY status`).all(),
        recentAudit: audit.list({ limit: 8 }).entries,
        orthanc: await orthanc.getDashboardSummary(),
      });
    }),
  );

  return router;
}
