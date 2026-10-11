export const ALERT_TYPES = ['no_show', 'cancellation', 'scheduling_conflict', 'unassigned', 'access', 'system'];

export function createAlertService(db) {
  const insert = db.prepare(`INSERT INTO alerts (type, description, resource) VALUES (?, ?, ?)`);
  const recentDuplicate = db.prepare(
    `SELECT id FROM alerts WHERE type = ? AND resource IS ? AND status = 'new' AND created_at >= datetime('now', ?)`,
  );

  const selectColumns = `
    alerts.id, alerts.type, alerts.description, alerts.resource, alerts.status,
    alerts.created_at AS createdAt, alerts.reviewed_at AS reviewedAt, reviewer.username AS reviewedBy
  `;

  return {
    // Skips identical unreviewed alerts raised within the window so repeated events don't flood the list.
    raise({ type, description, resource = null, dedupeMinutes = 0 }) {
      if (dedupeMinutes > 0 && recentDuplicate.get(type, resource, `-${Number(dedupeMinutes)} minutes`)) {
        return null;
      }
      return insert.run(type, description, resource).lastInsertRowid;
    },

    list({ status, type, limit = 200 } = {}) {
      const clauses = [];
      const params = {};
      if (status && status !== 'all') {
        clauses.push('alerts.status = @status');
        params.status = status;
      }
      if (type && type !== 'all') {
        clauses.push('alerts.type = @type');
        params.type = type;
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);

      const entries = db
        .prepare(
          `SELECT ${selectColumns} FROM alerts
           LEFT JOIN users reviewer ON reviewer.id = alerts.reviewed_by
           ${where} ORDER BY alerts.created_at DESC, alerts.id DESC LIMIT @limit`,
        )
        .all({ ...params, limit: safeLimit });

      const counts = db.prepare(`SELECT status, COUNT(*) AS total FROM alerts GROUP BY status`).all();
      const summary = { new: 0, reviewed: 0 };
      for (const row of counts) {
        summary[row.status] = row.total;
      }

      return { entries, summary };
    },

    review(id, userId) {
      const result = db
        .prepare(`UPDATE alerts SET status = 'reviewed', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ? AND status = 'new'`)
        .run(userId, Number(id));
      return result.changes > 0;
    },

    get(id) {
      return (
        db
          .prepare(`SELECT ${selectColumns} FROM alerts LEFT JOIN users reviewer ON reviewer.id = alerts.reviewed_by WHERE alerts.id = ?`)
          .get(Number(id)) ?? null
      );
    },
  };
}
