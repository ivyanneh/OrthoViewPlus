import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

function normalizeUsername(value) {
  return String(value || '').trim();
}

export function createAuthRouter({ db, audit, alerts, users, jwtSecret, jwtExpiresIn, requireAuth }) {
  const router = Router();
  const findUser = db.prepare('SELECT id, username, password_hash, role, status, restricted FROM users WHERE username = ?');
  const recentFailures = db.prepare(
    `SELECT COUNT(*) AS total FROM audit_logs
     WHERE action = 'login_failed' AND description = ? AND timestamp >= datetime('now', '-15 minutes')`,
  );

  router.post('/login', (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = req.body?.password;

    if (!username || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = findUser.get(username);
    const passwordValid = user ? bcrypt.compareSync(password, user.password_hash) : false;

    if (!user || !passwordValid) {
      const description = `Failed login attempt for username "${username}".`;
      audit.log({
        userId: user?.id ?? null,
        action: 'login_failed',
        target: 'auth',
        description,
      });
      if (alerts && recentFailures.get(description).total >= 3) {
        alerts.raise({
          type: 'access',
          description: `Repeated failed sign-in attempts for username "${username}" in the last 15 minutes.`,
          resource: `user:${username}`,
          dedupeMinutes: 15,
        });
      }
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    if (user.status !== 'active' || user.restricted) {
      audit.log({
        userId: user.id,
        action: 'login_blocked',
        target: 'auth',
        description: `Sign-in blocked for "${user.username}" (account ${user.restricted ? 'restricted' : user.status}).`,
      });
      return res.status(403).json({
        error: user.restricted
          ? 'This account is restricted. Contact an administrator.'
          : 'This account is inactive. Contact an administrator.',
      });
    }

    const token = jwt.sign(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
      },
      jwtSecret,
      { expiresIn: jwtExpiresIn },
    );

    audit.log({
      userId: user.id,
      action: 'LOGIN',
      target: 'auth',
      description: `User "${user.username}" signed in.`,
    });
    users?.recordLogin(user.id);

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  });

  router.post('/logout', (req, res) => {
    const header = req.headers.authorization || '';
    const [, token] = header.split(' ');
    let userId = null;
    let username = 'unknown';

    if (token) {
      try {
        const payload = jwt.verify(token, jwtSecret);
        userId = payload.sub;
        username = payload.username;
      } catch {
        // Token may already be expired; still record a logout attempt.
      }
    }

    audit.log({
      userId,
      action: 'LOGOUT',
      target: 'auth',
      description: `User "${username}" signed out.`,
    });

    return res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    return res.json({
      user: req.user,
    });
  });

  return router;
}
