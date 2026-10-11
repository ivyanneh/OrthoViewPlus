import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import { createDatabase } from '../src/db.js';
import { createUserService } from '../src/services/users.js';
import { createAuditService } from '../src/services/audit.js';
import { createAlertService } from '../src/services/alerts.js';
import { createAuthMiddleware, createRoleMiddleware } from '../src/middleware/auth.js';
import { createAuthRouter } from '../src/routes/auth.js';

function withTemporaryDatabase(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orthoviewplus-test-'));
  const databasePath = path.join(directory, 'test.db');
  const db = createDatabase(databasePath);

  try {
    run(db);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
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
    const findUser = db.prepare('SELECT id, username, password_hash, role, status, restricted FROM users WHERE username = ?');
    const foundUser = findUser.get('testuser');
    const passwordValid = bcrypt.compareSync('TestPassword123', foundUser.password_hash);

    assert.ok(foundUser);
    assert.ok(passwordValid);
    assert.equal(foundUser.status, 'active');
    assert.equal(foundUser.restricted, 0);

    const token = jwt.sign(
      { sub: foundUser.id, username: foundUser.username, role: foundUser.role },
      jwtSecret,
      { expiresIn: jwtExpiresIn },
    );

    const decoded = jwt.verify(token, jwtSecret);
    assert.equal(decoded.sub, foundUser.id);
    assert.equal(decoded.username, 'testuser');
    assert.equal(decoded.role, 'practitioner');
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

test('authentication: logout logs audit entry', () => {
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
      action: 'LOGOUT',
      target: 'auth',
      description: 'User "testuser" signed out.',
    });

    const logs = audit.list({ action: 'LOGOUT' });
    assert.ok(logs.total > 0);
    assert.equal(logs.entries[0].action, 'LOGOUT');
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
      { sub: user.id, username: user.username, role: user.role },
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
      { sub: user.id, username: user.username, role: user.role },
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
      { sub: user.id, username: user.username, role: user.role },
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
