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
      limit: req.query.limit,
      offset: req.query.offset,
      username: req.query.username,
      action: req.query.action,
      date: req.query.date,
    });
    res.json(result);
  });

  return router;
}
