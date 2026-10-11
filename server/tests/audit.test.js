import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDatabase } from '../src/db.js';
import { createUserService } from '../src/services/users.js';
import { createAuditService, AUDIT_CATEGORIES } from '../src/services/audit.js';

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

test('audit logging: log entry with user', () => {
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
      description: 'User signed in.',
    });

    const logs = audit.list();
    assert.equal(logs.total, 1);
    assert.equal(logs.entries[0].userId, user.id);
    assert.equal(logs.entries[0].action, 'LOGIN');
    assert.equal(logs.entries[0].target, 'auth');
    assert.equal(logs.entries[0].description, 'User signed in.');
    assert.ok(logs.entries[0].timestamp);
  });
});

test('audit logging: log entry without user', () => {
  withTemporaryDatabase((db) => {
    const audit = createAuditService(db);

    audit.log({
      userId: null,
      action: 'login_failed',
      target: 'auth',
      description: 'Failed login attempt.',
    });

    const logs = audit.list();
    assert.equal(logs.total, 1);
    assert.equal(logs.entries[0].userId, null);
    assert.equal(logs.entries[0].action, 'login_failed');
  });
});

test('audit logging: list with limit', () => {
  withTemporaryDatabase((db) => {
    const audit = createAuditService(db);

    for (let i = 0; i < 10; i++) {
      audit.log({
        action: 'test_action',
        description: `Test entry ${i}`,
      });
    }

    const logs = audit.list({ limit: 5 });
    assert.equal(logs.total, 10);
    assert.equal(logs.entries.length, 5);
  });
});

test('audit logging: list with offset', () => {
  withTemporaryDatabase((db) => {
    const audit = createAuditService(db);

    for (let i = 0; i < 10; i++) {
      audit.log({
        action: 'test_action',
        description: `Test entry ${i}`,
      });
    }

    const logs = audit.list({ limit: 5, offset: 5 });
    assert.equal(logs.total, 10);
    assert.equal(logs.entries.length, 5);
  });
});

test('audit logging: list filters by username', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const audit = createAuditService(db);

    const user1 = users.create({
      username: 'user1',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    const user2 = users.create({
      username: 'user2',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    audit.log({ userId: user1.id, action: 'test', description: 'User1 action' });
    audit.log({ userId: user2.id, action: 'test', description: 'User2 action' });

    const logs = audit.list({ username: 'user1' });
    assert.equal(logs.total, 1);
    assert.equal(logs.entries[0].username, 'user1');
  });
});

test('audit logging: list filters by action', () => {
  withTemporaryDatabase((db) => {
    const audit = createAuditService(db);

    audit.log({ action: 'LOGIN', description: 'Login' });
    audit.log({ action: 'LOGOUT', description: 'Logout' });
    audit.log({ action: 'LOGIN', description: 'Another login' });

    const logs = audit.list({ action: 'LOGIN' });
    assert.equal(logs.total, 2);
    assert.equal(logs.entries[0].action, 'LOGIN');
  });
});

test('audit logging: list filters by date', () => {
  withTemporaryDatabase((db) => {
    const audit = createAuditService(db);

    audit.log({ action: 'test', description: 'Test' });

    const today = new Date().toISOString().slice(0, 10);
    const logs = audit.list({ date: today });
    assert.equal(logs.total, 1);
  });
});

test('audit logging: list filters by role', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const audit = createAuditService(db);

    const admin = users.create({
      username: 'admin',
      password: 'TestPassword123',
      role: 'administrator',
    });

    const practitioner = users.create({
      username: 'practitioner',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    audit.log({ userId: admin.id, action: 'test', description: 'Admin action' });
    audit.log({ userId: practitioner.id, action: 'test', description: 'Practitioner action' });

    const logs = audit.list({ role: 'administrator' });
    assert.equal(logs.total, 1);
    assert.equal(logs.entries[0].role, 'administrator');
  });
});

test('audit logging: list filters by role system', () => {
  withTemporaryDatabase((db) => {
    const audit = createAuditService(db);

    audit.log({ userId: null, action: 'system_event', description: 'System event' });

    const logs = audit.list({ role: 'system' });
    assert.equal(logs.total, 1);
    assert.equal(logs.entries[0].userId, null);
  });
});

test('audit logging: list filters by date range', () => {
  withTemporaryDatabase((db) => {
    const audit = createAuditService(db);

    audit.log({ action: 'test', description: 'Test' });

    const today = new Date().toISOString().slice(0, 10);
    const logs = audit.list({ dateFrom: today, dateTo: today });
    assert.equal(logs.total, 1);
  });
});

test('audit logging: list filters by category', () => {
  withTemporaryDatabase((db) => {
    const audit = createAuditService(db);

    audit.log({ action: 'LOGIN', description: 'Login' });
    audit.log({ action: 'user_create', description: 'User created' });
    audit.log({ action: 'LOGOUT', description: 'Logout' });

    const logs = audit.list({ category: 'authentication' });
    assert.equal(logs.total, 2);
  });
});

test('audit logging: list filters by search', () => {
  withTemporaryDatabase((db) => {
    const audit = createAuditService(db);

    audit.log({ action: 'test', description: 'Important event' });
    audit.log({ action: 'test', description: 'Regular event' });

    const logs = audit.list({ search: 'important' });
    assert.equal(logs.total, 1);
    assert.ok(logs.entries[0].description.toLowerCase().includes('important'));
  });
});

test('audit logging: respects limit maximum', () => {
  withTemporaryDatabase((db) => {
    const audit = createAuditService(db);

    for (let i = 0; i < 600; i++) {
      audit.log({ action: 'test', description: `Test ${i}` });
    }

    const logs = audit.list({ limit: 1000 });
    assert.equal(logs.entries.length, 500); // Max limit is 500
  });
});

test('audit logging: respects limit minimum', () => {
  withTemporaryDatabase((db) => {
    const audit = createAuditService(db);

    audit.log({ action: 'test', description: 'Test' });

    const logs = audit.list({ limit: 0 });
    assert.equal(logs.entries.length, 1); // Min limit is 1
  });
});

test('audit logging: entries are ordered by timestamp descending', () => {
  withTemporaryDatabase((db) => {
    const audit = createAuditService(db);

    audit.log({ action: 'test1', description: 'First' });
    audit.log({ action: 'test2', description: 'Second' });
    audit.log({ action: 'test3', description: 'Third' });

    const logs = audit.list({ limit: 3 });
    assert.equal(logs.entries[0].action, 'test3');
    assert.equal(logs.entries[1].action, 'test2');
    assert.equal(logs.entries[2].action, 'test1');
  });
});

test('audit logging: includes user information in results', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const audit = createAuditService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    audit.log({ userId: user.id, action: 'test', description: 'Test' });

    const logs = audit.list();
    assert.equal(logs.entries[0].username, 'testuser');
    assert.equal(logs.entries[0].role, 'practitioner');
  });
});

test('audit logging: audit categories are defined', () => {
  assert.ok(AUDIT_CATEGORIES.authentication);
  assert.ok(AUDIT_CATEGORIES.user_management);
  assert.ok(AUDIT_CATEGORIES.study_access);
  assert.ok(AUDIT_CATEGORIES.scheduling);
  assert.ok(AUDIT_CATEGORIES.alerts);
  assert.ok(AUDIT_CATEGORIES.administration);
});

test('audit logging: authentication category includes expected actions', () => {
  assert.ok(AUDIT_CATEGORIES.authentication.includes('LOGIN'));
  assert.ok(AUDIT_CATEGORIES.authentication.includes('LOGOUT'));
  assert.ok(AUDIT_CATEGORIES.authentication.includes('login_failed'));
  assert.ok(AUDIT_CATEGORIES.authentication.includes('login_blocked'));
});

test('audit logging: user_management category includes expected actions', () => {
  assert.ok(AUDIT_CATEGORIES.user_management.includes('user_create'));
  assert.ok(AUDIT_CATEGORIES.user_management.includes('user_update'));
  assert.ok(AUDIT_CATEGORIES.user_management.includes('user_role_change'));
  assert.ok(AUDIT_CATEGORIES.user_management.includes('user_password_reset'));
});
