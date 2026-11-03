export function createNotificationService(db) {
  const insert = db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id)
    VALUES (@userId, @type, @title, @message, @resourceType, @resourceId)
  `);

  const select = `
    SELECT id, user_id AS userId, type, title, message,
           resource_type AS resourceType, resource_id AS resourceId,
           read_at AS readAt, created_at AS createdAt
    FROM notifications
  `;

  return {
    create({ userId, type, title, message, resourceType = null, resourceId = null }) {
      const result = insert.run({ userId, type, title, message, resourceType, resourceId: resourceId == null ? null : String(resourceId) });
      return db.prepare(`${select} WHERE id = ?`).get(result.lastInsertRowid);
    },

    notifyRole(role, payload) {
      const users = db.prepare(`SELECT id FROM users WHERE role = ? AND status = 'active' AND restricted = 0`).all(role);
      return users.map((user) => this.create({ ...payload, userId: user.id }));
    },

    listForUser(userId, { unreadOnly = false, limit = 50 } = {}) {
      const clauses = ['user_id = @userId'];
      if (unreadOnly) {
        clauses.push('read_at IS NULL');
      }
      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
      return db
        .prepare(`${select} WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT @limit`)
        .all({ userId: Number(userId), limit: safeLimit });
    },

    unreadCount(userId) {
      return db.prepare(`SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND read_at IS NULL`).get(Number(userId)).total;
    },

    markRead(id, userId) {
      db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL`).run(
        Number(id),
        Number(userId),
      );
      return db.prepare(`${select} WHERE id = ? AND user_id = ?`).get(Number(id), Number(userId));
    },

    markAllRead(userId) {
      db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`).run(Number(userId));
    },
  };
}
