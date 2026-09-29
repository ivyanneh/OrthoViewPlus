import bcrypt from 'bcryptjs';

export function seedDevelopmentAdmin(db, { username, password }) {
  if (!username || !password) {
    return { created: false, reason: 'missing-credentials' };
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return { created: false, reason: 'exists' };
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (username, password_hash, role)
     VALUES (?, ?, ?)`,
  ).run(username, passwordHash, 'administrator');

  return { created: true };
}
