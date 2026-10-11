import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDatabase } from '../src/db.js';
import { createUserService } from '../src/services/users.js';
import { createAuthMiddleware, createRoleMiddleware } from '../src/middleware/auth.js';

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

test('authorization: role middleware allows administrator role', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const requireAdministrator = createRoleMiddleware('administrator');

    const user = users.create({
      username: 'admin',
      password: 'TestPassword123',
      role: 'administrator',
    });

    const req = { user: { id: user.id, username: 'admin', role: 'administrator' } };
    const res = {
      status: (code) => ({ json: (data) => ({ status: code, data }) }),
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAdministrator(req, res, next);

    assert.equal(nextCalled, true);
  });
});

test('authorization: role middleware denies practitioner role for admin-only route', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const requireAdministrator = createRoleMiddleware('administrator');

    const user = users.create({
      username: 'practitioner',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    const req = { user: { id: user.id, username: 'practitioner', role: 'practitioner' } };
    const res = {
      status: (code) => ({ json: (data) => ({ status: code, data }) }),
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAdministrator(req, res, next);

    assert.equal(nextCalled, false);
  });
});

test('authorization: role middleware denies request without user', () => {
  withTemporaryDatabase((db) => {
    const requireAdministrator = createRoleMiddleware('administrator');

    const req = {};
    const res = {
      status: (code) => ({ json: (data) => ({ status: code, data }) }),
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAdministrator(req, res, next);

    assert.equal(nextCalled, false);
  });
});

test('authorization: role middleware accepts multiple allowed roles', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const requireAdminOrPractitioner = createRoleMiddleware(['administrator', 'practitioner']);

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

    // Test administrator
    const req1 = { user: { id: admin.id, username: 'admin', role: 'administrator' } };
    const res1 = {
      status: (code) => ({ json: (data) => ({ status: code, data }) }),
    };
    let nextCalled1 = false;
    const next1 = () => { nextCalled1 = true; };

    requireAdminOrPractitioner(req1, res1, next1);
    assert.equal(nextCalled1, true);

    // Test practitioner
    const req2 = { user: { id: practitioner.id, username: 'practitioner', role: 'practitioner' } };
    const res2 = {
      status: (code) => ({ json: (data) => ({ status: code, data }) }),
    };
    let nextCalled2 = false;
    const next2 = () => { nextCalled2 = true; };

    requireAdminOrPractitioner(req2, res2, next2);
    assert.equal(nextCalled2, true);
  });
});

test('authorization: role middleware denies role not in allowed list', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const requireAdministrator = createRoleMiddleware('administrator');

    const user = users.create({
      username: 'practitioner',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    const req = { user: { id: user.id, username: 'practitioner', role: 'practitioner' } };
    const res = {
      status: (code) => ({ json: (data) => ({ status: code, data }) }),
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAdministrator(req, res, next);

    assert.equal(nextCalled, false);
  });
});
