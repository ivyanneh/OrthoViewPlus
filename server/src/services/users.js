import bcrypt from 'bcryptjs';

export const ROLES = ['administrator', 'practitioner', 'radiologist'];
export const USER_STATUSES = ['active', 'inactive', 'removed'];
export const MIN_PASSWORD_LENGTH = 8;

const PUBLIC_COLUMNS = `
  id, username, role, full_name AS fullName, email, department, status,
  restricted, restriction_reason AS restrictionReason,
  created_at AS createdAt, updated_at AS updatedAt, last_login_at AS lastLoginAt
`;

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function toPublic(row) {
  if (!row) {
    return null;
  }
  return { ...row, restricted: Boolean(row.restricted) };
}

function cleanText(value, maxLength = 120) {
  if (value === undefined) {
    return undefined;
  }
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function validateUsername(username) {
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) {
    throw new UserError('Username must be 3-40 characters: letters, numbers, dot, dash or underscore.');
  }
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new UserError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

function validateEmail(email) {
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new UserError('Enter a valid email address.');
  }
}

export function createUserService(db) {
  const getById = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`);
  const countActiveAdmins = db.prepare(
    `SELECT COUNT(*) AS total FROM users WHERE role = 'administrator' AND status = 'active' AND restricted = 0`,
  );

  function get(id) {
    return toPublic(getById.get(Number(id)));
  }

  function requireUser(id) {
    const user = get(id);
    if (!user) {
      throw new UserError('User not found.', 404);
    }
    return user;
  }

  function isLastActiveAdmin(user) {
    return user.role === 'administrator' && user.status === 'active' && !user.restricted && countActiveAdmins.get().total <= 1;
  }

  function guardSelf(user, actorId, message) {
    if (Number(user.id) === Number(actorId)) {
      throw new UserError(message, 409);
    }
  }

  return {
    get,

    list() {
      return db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY username COLLATE NOCASE`).all().map(toPublic);
    },

    getAuthState(id) {
      return db.prepare('SELECT id, username, role, status, restricted FROM users WHERE id = ?').get(Number(id)) ?? null;
    },

    create({ username, password, role, fullName, email, department }) {
      const name = String(username || '').trim();
      validateUsername(name);
      validatePassword(password);
      if (!ROLES.includes(role)) {
        throw new UserError('Select a valid role.');
      }
      const cleanEmail = cleanText(email);
      validateEmail(cleanEmail);

      if (db.prepare('SELECT id FROM users WHERE username = ?').get(name)) {
        throw new UserError('That username is already in use.', 409);
      }

      const result = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, full_name, email, department, status, restricted, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', 0, datetime('now'))`,
        )
        .run(name, bcrypt.hashSync(password, 10), role, cleanText(fullName), cleanEmail, cleanText(department));

      return get(result.lastInsertRowid);
    },

    update(id, changes, actorId) {
      const user = requireUser(id);
      if (user.status === 'removed') {
        throw new UserError('Removed accounts cannot be edited.', 409);
      }

      const next = {
        fullName: changes.fullName !== undefined ? cleanText(changes.fullName) : user.fullName,
        email: changes.email !== undefined ? cleanText(changes.email) : user.email,
        department: changes.department !== undefined ? cleanText(changes.department) : user.department,
        role: changes.role ?? user.role,
      };
      validateEmail(next.email);

      if (!ROLES.includes(next.role)) {
        throw new UserError('Select a valid role.');
      }

      const roleChanged = next.role !== user.role;
      if (roleChanged) {
        guardSelf(user, actorId, 'You cannot change the role of your own account.');
        if (isLastActiveAdmin(user)) {
          throw new UserError('At least one active administrator must remain.', 409);
        }
      }

      const passwordChanged = typeof changes.password === 'string' && changes.password.length > 0;
      if (passwordChanged) {
        guardSelf(user, actorId, 'Your own password cannot be reset from User Management.');
        validatePassword(changes.password);
      }

      db.prepare(
        `UPDATE users SET full_name = ?, email = ?, department = ?, role = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(next.fullName, next.email, next.department, next.role, user.id);

      if (passwordChanged) {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(changes.password, 10), user.id);
      }

      return { before: user, user: get(user.id), roleChanged, passwordChanged };
    },

    setStatus(id, status, actorId) {
      const user = requireUser(id);
      if (!USER_STATUSES.includes(status)) {
        throw new UserError('Invalid account status.');
      }
      if (user.status === 'removed') {
        throw new UserError('Removed accounts cannot be changed.', 409);
      }
      if (status !== 'active') {
        guardSelf(user, actorId, 'You cannot deactivate or remove your own account.');
        if (isLastActiveAdmin(user)) {
          throw new UserError('At least one active administrator must remain.', 409);
        }
      }
      db.prepare(`UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, user.id);
      return get(user.id);
    },

    setRestriction(id, restricted, reason, actorId) {
      const user = requireUser(id);
      if (user.status === 'removed') {
        throw new UserError('Removed accounts cannot be changed.', 409);
      }
      if (restricted) {
        guardSelf(user, actorId, 'You cannot restrict your own account.');
        if (isLastActiveAdmin(user)) {
          throw new UserError('At least one active administrator must remain.', 409);
        }
      }
      db.prepare(
        `UPDATE users SET restricted = ?, restriction_reason = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(restricted ? 1 : 0, restricted ? cleanText(reason, 240) : null, user.id);
      return get(user.id);
    },

    recordLogin(id) {
      db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(Number(id));
    },
  };
}
