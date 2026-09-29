export function createAuditService(db) {
  const insert = db.prepare(`
    INSERT INTO audit_logs (user_id, action, target, description)
    VALUES (@userId, @action, @target, @description)
  `);

  function buildFilters({ username, action, date }) {
    const clauses = [];
    const params = {};

    if (username) {
      clauses.push('LOWER(users.username) LIKE @username');
      params.username = `%${String(username).toLowerCase()}%`;
    }

    if (action) {
      clauses.push('LOWER(audit_logs.action) LIKE @action');
      params.action = `%${String(action).toLowerCase()}%`;
    }

    if (date) {
      clauses.push('audit_logs.timestamp LIKE @date');
      params.date = `${String(date)}%`;
    }

    return { clauses, params };
  }

  return {
    log({ userId = null, action, target = null, description = null }) {
      insert.run({ userId, action, target, description });
    },
    list({ limit = 100, offset = 0, username, action, date } = {}) {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      const { clauses, params } = buildFilters({ username, action, date });
      const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

      const entries = db
        .prepare(`
          SELECT
            audit_logs.id,
            audit_logs.user_id AS userId,
            users.username,
            audit_logs.action,
            audit_logs.target,
            audit_logs.description,
            audit_logs.timestamp
          FROM audit_logs
          LEFT JOIN users ON users.id = audit_logs.user_id
          ${whereClause}
          ORDER BY audit_logs.timestamp DESC, audit_logs.id DESC
          LIMIT @limit OFFSET @offset
        `)
        .all({ ...params, limit: safeLimit, offset: safeOffset });

      const total = db
        .prepare(`
          SELECT COUNT(*) AS total
          FROM audit_logs
          LEFT JOIN users ON users.id = audit_logs.user_id
          ${whereClause}
        `)
        .get(params).total;

      return { total, entries };
    },
  };
}
