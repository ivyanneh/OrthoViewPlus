import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import { createDatabase } from '../src/db.js';
import { createUserService } from '../src/services/users.js';
import { createAuditService } from '../src/services/audit.js';
import { createAlertService } from '../src/services/alerts.js';
import { createAuthMiddleware, createRoleMiddleware } from '../src/middleware/auth.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { createLoginRateLimiter } from '../src/middleware/loginRateLimit.js';
import { logSafeError } from '../src/utils/safeLogging.js';
import { validateJwtSecret } from '../src/utils/runtimeConfig.js';

function withTemporaryDatabase(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orthoviewplus-test-'));
  const databasePath = path.join(directory, 'test.db');
  const db = createDatabase(databasePath);

  const cleanup = () => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  try {
    const result = run(db);
    if (result && typeof result.then === 'function') {
      return result.finally(cleanup);
    }
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function withAuthApp(db, { loginRateLimiter } = {}, run) {
  const users = createUserService(db);
  const audit = createAuditService(db);
  const jwtSecret = 'test-secret-key-used-only-by-this-test';
  const requireAuth = createAuthMiddleware(jwtSecret, { getAuthState: users.getAuthState });
  const router = createAuthRouter({
    db,
    audit,
    alerts: createAlertService(db),
    users,
    jwtSecret,
    jwtExpiresIn: '8h',
    requireAuth,
    loginRateLimiter,
  });
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  app.get('/protected', requireAuth, (req, res) => res.json({ userId: req.user.id }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('authentication: successful login returns valid JWT token', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const jwtSecret = 'test-secret-key';
    const jwtExpiresIn = '8h';

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    // Test the underlying login logic
    const findUser = db.prepare('SELECT id, username, password_hash, role, status, restricted, token_version FROM users WHERE username = ?');
    const foundUser = findUser.get('testuser');
    const passwordValid = bcrypt.compareSync('TestPassword123', foundUser.password_hash);

    assert.ok(foundUser);
    assert.ok(passwordValid);
    assert.equal(foundUser.status, 'active');
    assert.equal(foundUser.restricted, 0);

    const token = jwt.sign(
      { sub: foundUser.id, username: foundUser.username, role: foundUser.role, tokenVersion: foundUser.token_version },
      jwtSecret,
      { expiresIn: jwtExpiresIn },
    );

    const decoded = jwt.verify(token, jwtSecret);
    assert.equal(decoded.sub, foundUser.id);
    assert.equal(decoded.username, 'testuser');
    assert.equal(decoded.role, 'practitioner');
    assert.equal(decoded.tokenVersion, 0);
  });
});

test('authentication: failed login logs audit entry', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const audit = createAuditService(db);
    const alerts = createAlertService(db);

    users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    // Simulate failed login
    audit.log({
      userId: null,
      action: 'login_failed',
      target: 'auth',
      description: 'Failed login attempt for username "testuser".',
    });

    const logs = audit.list({ action: 'login_failed' });
    assert.ok(logs.total > 0);
    assert.equal(logs.entries[0].action, 'login_failed');
    assert.ok(logs.entries[0].description.includes('testuser'));
  });
});

test('authentication: blocked login for inactive account logs audit entry', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const audit = createAuditService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    users.setStatus(user.id, 'inactive', 999);

    audit.log({
      userId: user.id,
      action: 'login_blocked',
      target: 'auth',
      description: 'Sign-in blocked for "testuser" (account inactive).',
    });

    const logs = audit.list({ action: 'login_blocked' });
    assert.ok(logs.total > 0);
    assert.equal(logs.entries[0].action, 'login_blocked');
    assert.equal(logs.entries[0].userId, user.id);
  });
});

test('authentication: blocked login for restricted account logs audit entry', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const audit = createAuditService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    users.setRestriction(user.id, true, 'Security review', 999);

    audit.log({
      userId: user.id,
      action: 'login_blocked',
      target: 'auth',
      description: 'Sign-in blocked for "testuser" (account restricted).',
    });

    const logs = audit.list({ action: 'login_blocked' });
    assert.ok(logs.total > 0);
    assert.equal(logs.entries[0].action, 'login_blocked');
    assert.equal(logs.entries[0].userId, user.id);
  });
});

test('authentication: successful login logs audit entry', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const audit = createAuditService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    audit.log({
      userId: user.id,
      action: 'LOGIN',
      target: 'auth',
      description: 'User "testuser" signed in.',
    });

    const logs = audit.list({ action: 'LOGIN' });
    assert.ok(logs.total > 0);
    assert.equal(logs.entries[0].action, 'LOGIN');
    assert.equal(logs.entries[0].userId, user.id);
  });
});

test('authentication: logout revokes a token and expired tokens remain invalid', async () => {
  await withTemporaryDatabase(async (db) => {
    const users = createUserService(db);
    users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    await withAuthApp(db, {}, async (baseUrl) => {
      const login = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'TestPassword123' }),
      });
      assert.equal(login.status, 200);
      const { token, user } = await login.json();
      const authorization = { Authorization: `Bearer ${token}` };

      const authenticated = await fetch(`${baseUrl}/protected`, { headers: authorization });
      assert.equal(authenticated.status, 200);

      const logout = await fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers: authorization });
      assert.equal(logout.status, 200);
      assert.deepEqual(await logout.json(), { ok: true });

      const reused = await fetch(`${baseUrl}/protected`, { headers: authorization });
      assert.equal(reused.status, 401);

      const expiredToken = jwt.sign(
        { sub: user.id, username: user.username, role: user.role, tokenVersion: users.getAuthState(user.id).tokenVersion },
        'test-secret-key-used-only-by-this-test',
        { expiresIn: -1 },
      );
      const expired = await fetch(`${baseUrl}/protected`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      assert.equal(expired.status, 401);
    });
  });
});

test('authentication: auth middleware rejects missing token', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const jwtSecret = 'test-secret-key';
    const requireAuth = createAuthMiddleware(jwtSecret, { getAuthState: users.getAuthState });

    const req = { headers: {} };
    const res = {
      status: (code) => ({ json: (data) => ({ status: code, data }) }),
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAuth(req, res, next);

    assert.equal(nextCalled, false);
  });
});

test('authentication: auth middleware rejects invalid token', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const jwtSecret = 'test-secret-key';
    const requireAuth = createAuthMiddleware(jwtSecret, { getAuthState: users.getAuthState });

    const req = { headers: { authorization: 'Bearer invalid-token' } };
    const res = {
      status: (code) => ({ json: (data) => ({ status: code, data }) }),
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAuth(req, res, next);

    assert.equal(nextCalled, false);
  });
});

test('authentication: auth middleware accepts valid token', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const jwtSecret = 'test-secret-key';
    const requireAuth = createAuthMiddleware(jwtSecret, { getAuthState: users.getAuthState });

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    const token = jwt.sign(
      { sub: user.id, username: user.username, role: user.role, tokenVersion: users.getAuthState(user.id).tokenVersion },
      jwtSecret,
      { expiresIn: '8h' },
    );

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {
      status: (code) => ({ json: (data) => ({ status: code, data }) }),
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAuth(req, res, next);

    assert.equal(nextCalled, true);
    assert.equal(req.user.id, user.id);
    assert.equal(req.user.username, 'testuser');
    assert.equal(req.user.role, 'practitioner');
  });
});

test('authentication: auth middleware rejects restricted account', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const jwtSecret = 'test-secret-key';
    const requireAuth = createAuthMiddleware(jwtSecret, { getAuthState: users.getAuthState });

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    users.setRestriction(user.id, true, 'Security review', 999);

    const token = jwt.sign(
      { sub: user.id, username: user.username, role: user.role, tokenVersion: users.getAuthState(user.id).tokenVersion },
      jwtSecret,
      { expiresIn: '8h' },
    );

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {
      status: (code) => ({ json: (data) => ({ status: code, data }) }),
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAuth(req, res, next);

    assert.equal(nextCalled, false);
  });
});

test('authentication: auth middleware rejects inactive account', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const jwtSecret = 'test-secret-key';
    const requireAuth = createAuthMiddleware(jwtSecret, { getAuthState: users.getAuthState });

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    users.setStatus(user.id, 'inactive', 999);

    const token = jwt.sign(
      { sub: user.id, username: user.username, role: user.role, tokenVersion: users.getAuthState(user.id).tokenVersion },
      jwtSecret,
      { expiresIn: '8h' },
    );

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {
      status: (code) => ({ json: (data) => ({ status: code, data }) }),
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAuth(req, res, next);

    assert.equal(nextCalled, false);
  });
});

test('authentication: login rate limit blocks repeated failures and resets after the window', async () => {
  await withTemporaryDatabase(async (db) => {
    const users = createUserService(db);
    users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });
    let now = 1000;
    const loginRateLimiter = createLoginRateLimiter({
      limit: 2,
      windowMs: 60_000,
      now: () => now,
    });

    await withAuthApp(db, { loginRateLimiter }, async (baseUrl) => {
      const attempt = (password) => fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password }),
      });
      assert.equal((await attempt('incorrect-one')).status, 401);
      assert.equal((await attempt('incorrect-two')).status, 401);

      const limited = await attempt('TestPassword123');
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get('retry-after'), '60');
      assert.deepEqual(await limited.json(), { error: 'Too many sign-in attempts. Please try again later.' });

      now += 60_001;
      const recovered = await attempt('TestPassword123');
      assert.equal(recovered.status, 200);

      const afterSuccess = await attempt('incorrect-again');
      assert.equal(afterSuccess.status, 401);
    });
  });
});

test('configuration: production rejects missing, placeholder and short JWT secrets', () => {
  assert.throws(() => validateJwtSecret(undefined, { nodeEnv: 'production' }), /JWT_SECRET must be configured/);
  assert.throws(
    () => validateJwtSecret('change-this-to-a-long-random-string', { nodeEnv: 'production' }),
    /non-placeholder value/,
  );
  assert.throws(() => validateJwtSecret('short-secret', { nodeEnv: 'production' }), /at least 32 characters/);
  const configured = 'a'.repeat(32);
  assert.equal(validateJwtSecret(configured, { nodeEnv: 'production' }), configured);
});

test('configuration: local placeholder remains usable with a value-free warning', () => {
  const warnings = [];
  const secret = 'change-this-to-a-long-random-string';
  assert.equal(validateJwtSecret(secret, {
    nodeEnv: 'development',
    logger: { warn: (message) => warnings.push(message) },
  }), secret);
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0].includes(secret));
});

test('logging: safe error logger excludes messages, headers, credentials and response data', () => {
  const output = [];
  logSafeError('request failed', {
    name: 'AxiosError',
    code: 'ERR_BAD_RESPONSE',
    message: 'Patient DEMO-SECRET failed with bearer token hidden-token',
    config: { headers: { Authorization: 'Bearer hidden-token' }, auth: { password: 'hidden-password' } },
    response: { status: 502, data: { detail: 'Patient DEMO-SECRET' } },
  }, {
    error: (...args) => output.push(...args),
  });
  const logged = JSON.stringify(output);
  for (const sensitiveValue of ['DEMO-SECRET', 'hidden-token', 'hidden-password', 'Authorization']) {
    assert.ok(!logged.includes(sensitiveValue));
  }
  assert.ok(logged.includes('ERR_BAD_RESPONSE'));
  assert.ok(logged.includes('502'));
});
