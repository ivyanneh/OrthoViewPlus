import { Router } from 'express';

export function createDashboardRouter({ orthanc, audit }) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      audit.log({
        userId: req.user?.id ?? null,
        action: 'view_dashboard',
        target: 'dashboard',
        description: `User "${req.user?.username ?? 'unknown'}" viewed the dashboard.`,
      });

      const summary = await orthanc.getDashboardSummary();
      const recentAudit = audit.list({ limit: 5 }).entries;

      res.json({
        ...summary,
        recentAudit,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
