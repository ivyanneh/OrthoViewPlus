import { Router } from 'express';

export function createAuditRouter({ audit }) {
  const router = Router();

  router.get('/', (req, res) => {
    audit.log({
      userId: req.user?.id ?? null,
      action: 'view_audit_log',
      target: 'audit_log',
      description: `User "${req.user?.username ?? 'unknown'}" viewed the audit log.`,
    });

    const result = audit.list({
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      username: req.query.username,
      action: req.query.action,
      date: req.query.date,
      role: req.query.role,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      category: req.query.category,
      search: req.query.search,
    });
    res.json(result);
  });

  return router;
}
