export const AUDIT_CATEGORIES = {
  authentication: ['LOGIN', 'LOGOUT', 'login_success', 'logout', 'login_failed', 'login_blocked'],
  user_management: [
    'user_create',
    'user_update',
    'user_role_change',
    'user_password_reset',
    'user_activate',
    'user_deactivate',
    'user_remove',
    'user_restrict',
    'user_unrestrict',
  ],
  study_access: ['view_exposure_index', 'view_compare_scans', 'compare_scans'],
  scheduling: ['schedule_create', 'schedule_update', 'schedule_status_change'],
  alerts: ['alert_review'],
  administration: [
    'view_dashboard',
    'view_audit_log',
    'view_admin_dashboard',
    'view_user_management',
    'view_imaging_schedule',
    'view_alerts',
    'view_modality_monitoring',
    'view_system_administration',
  ],
};

export function createAuditService(db) {
  const insert = db.prepare(`
    INSERT INTO audit_logs (user_id, action, target, description)
    VALUES (@userId, @action, @target, @description)
  `);

  function buildFilters({ username, action, date, role, dateFrom, dateTo, category, search }) {
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

    if (role === 'system') {
      clauses.push('users.id IS NULL');
    } else if (role === 'administrator' || role === 'practitioner') {
      clauses.push('users.role = @role');
      params.role = role;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateFrom || ''))) {
      clauses.push('audit_logs.timestamp >= @dateFrom');
      params.dateFrom = `${dateFrom} 00:00:00`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateTo || ''))) {
      clauses.push('audit_logs.timestamp <= @dateTo');
      params.dateTo = `${dateTo} 23:59:59`;
    }

    const categoryActions = AUDIT_CATEGORIES[category];
    if (categoryActions) {
      const keys = categoryActions.map((value, index) => {
        params[`category${index}`] = value;
        return `@category${index}`;
      });
      clauses.push(`audit_logs.action IN (${keys.join(', ')})`);
    }

    if (search) {
      clauses.push(
        '(LOWER(audit_logs.description) LIKE @search OR LOWER(audit_logs.target) LIKE @search OR LOWER(audit_logs.action) LIKE @search)',
      );
      params.search = `%${String(search).toLowerCase()}%`;
    }

    return { clauses, params };
  }

  return {
    log({ userId = null, action, target = null, description = null }) {
      insert.run({ userId, action, target, description });
    },
    list({ limit = 100, offset = 0, username, action, date, role, dateFrom, dateTo, category, search } = {}) {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      const { clauses, params } = buildFilters({ username, action, date, role, dateFrom, dateTo, category, search });
      const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

      const entries = db
        .prepare(`
          SELECT
            audit_logs.id,
            audit_logs.user_id AS userId,
            users.username,
            users.role,
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
