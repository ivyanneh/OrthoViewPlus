import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createLoginRateLimiter } from '../middleware/loginRateLimit.js';

function normalizeUsername(value) {
  return String(value || '').trim();
}

export function createAuthRouter({
  db,
  audit,
  alerts,
  users,
  jwtSecret,
  jwtExpiresIn,
  requireAuth,
  loginRateLimiter = createLoginRateLimiter(),
}) {
  const router = Router();
  const findUser = db.prepare(
    'SELECT id, username, password_hash, role, status, restricted, token_version FROM users WHERE username = ?',
  );
  const recentFailures = db.prepare(
    `SELECT COUNT(*) AS total FROM audit_logs
     WHERE action = 'login_failed' AND description = ? AND timestamp >= datetime('now', '-15 minutes')`,
  );

  router.post('/login', (req, res) => {
    const clientKey = loginRateLimiter.clientKey(req);
    const retryAfter = loginRateLimiter.retryAfter(clientKey);
    if (retryAfter) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many sign-in attempts. Please try again later.' });
    }

    const username = normalizeUsername(req.body?.username);
    const password = req.body?.password;

    if (!username || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = findUser.get(username);
    const passwordValid = user ? bcrypt.compareSync(password, user.password_hash) : false;

    if (!user || !passwordValid) {
      loginRateLimiter.recordFailure(clientKey);
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
        tokenVersion: user.token_version,
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
    loginRateLimiter.reset(clientKey);

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  });

  router.post('/logout', requireAuth, (req, res) => {
    users.revokeTokens(req.user.id);
    audit.log({
      userId: req.user.id,
      action: 'LOGOUT',
      target: 'auth',
      description: `User "${req.user.username}" signed out.`,
    });

    return res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    return res.json({
      user: req.user,
    });
  });

  router.patch('/me', requireAuth, (req, res) => {
    const { full_name, email, phone, theme_preference, notification_preference } = req.body || {};
    
    const updates = [];
    const values = [];
    
    if (full_name !== undefined) {
      updates.push('full_name = ?');
      values.push(full_name);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone);
    }
    if (theme_preference !== undefined) {
      updates.push('theme_preference = ?');
      values.push(theme_preference);
    }
    if (notification_preference !== undefined) {
      updates.push('notification_preference = ?');
      values.push(notification_preference ? 1 : 0);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }
    
    updates.push('updated_at = datetime("now")');
    values.push(req.user.id);
    
    const stmt = db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    
    audit.log({
      userId: req.user.id,
      action: 'profile_update',
      target: `user:${req.user.id}`,
      description: `User "${req.user.username}" updated their profile.`,
    });
    
    const updatedUser = db.prepare(
      'SELECT id, username, full_name, email, phone, role, theme_preference, notification_preference FROM users WHERE id = ?'
    ).get(req.user.id);
    
    return res.json({ user: updatedUser });
  });

  router.post('/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }
    
    const user = db.prepare('SELECT id, password_hash, token_version FROM users WHERE id = ?').get(req.user.id);
    
    const passwordValid = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const newTokenVersion = (user.token_version || 0) + 1;
    
    db.prepare(
      'UPDATE users SET password_hash = ?, token_version = ?, updated_at = datetime("now") WHERE id = ?'
    ).run(newPasswordHash, newTokenVersion, req.user.id);
    
    audit.log({
      userId: req.user.id,
      action: 'password_change',
      target: `user:${req.user.id}`,
      description: `User "${req.user.username}" changed their password.`,
    });
    
    return res.json({ ok: true });
  });

  return router;
}
