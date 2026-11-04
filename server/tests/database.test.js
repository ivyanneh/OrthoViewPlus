
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';

import { createDatabase } from '../src/db.js';
import { seedDevelopmentAdmin } from '../src/seed.js';

function withTemporaryDatabase(run) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'orthoviewplus-test-'),
  );

  const databasePath = path.join(directory, 'test.db');
  const db = createDatabase(databasePath);

  try {
    run(db);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('database initializes required application tables', () => {
  withTemporaryDatabase((db) => {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table'`,
      )
      .all()
      .map((row) => row.name);

    for (const table of [
      'users',
      'audit_logs',
      'imaging_schedule',
      'alerts',
      'patients',
      'appointments',
      'imaging_requests',
      'imaging_studies',
      'radiology_reports',
      'notifications',
      'ai_jobs',
      'ai_results',
      'patient_dicom_mappings',
    ]) {
      assert.ok(tables.includes(table), `Missing table: ${table}`);
    }
  });
});

test('database enables foreign-key enforcement', () => {
  withTemporaryDatabase((db) => {
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  });
});

test('database adds token versioning to existing user records', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orthoviewplus-legacy-db-'));
  const databasePath = path.join(directory, 'legacy.db');
  const legacyDb = new Database(databasePath);
  legacyDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'practitioner',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO users (username, password_hash) VALUES ('legacy-user', 'test-hash');
  `);
  legacyDb.close();

  const db = createDatabase(databasePath);
  try {
    assert.equal(db.prepare('SELECT token_version AS version FROM users WHERE username = ?').get('legacy-user').version, 0);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('administrator password is stored as a bcrypt hash', () => {
  withTemporaryDatabase((db) => {
    const password = 'TestOnly-Password-928!';

    const result = seedDevelopmentAdmin(db, {
      username: 'test_admin',
      password,
    });

    assert.equal(result.created, true);

    const user = db
      .prepare(
        'SELECT username, password_hash FROM users WHERE username = ?',
      )
      .get('test_admin');

    assert.ok(user);
    assert.notEqual(user.password_hash, password);
    assert.match(user.password_hash, /^\$2[aby]\$/);
    assert.equal(bcrypt.compareSync(password, user.password_hash), true);
  });
});

test('administrator seeding does not duplicate an existing account', () => {
  withTemporaryDatabase((db) => {
    const credentials = {
      username: 'test_admin',
      password: 'TestOnly-Password-928!',
    };

    assert.equal(seedDevelopmentAdmin(db, credentials).created, true);
    assert.equal(seedDevelopmentAdmin(db, credentials).created, false);

    assert.equal(
      db.prepare('SELECT COUNT(*) AS total FROM users').get().total,
      1,
    );
  });
});

test('administrator is not seeded when the password is missing', () => {
  withTemporaryDatabase((db) => {
    const result = seedDevelopmentAdmin(db, {
      username: 'test_admin',
      password: '',
    });

    assert.equal(result.created, false);

    assert.equal(
      db.prepare('SELECT COUNT(*) AS total FROM users').get().total,
      0,
    );
  });
});