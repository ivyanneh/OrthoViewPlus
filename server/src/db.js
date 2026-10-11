import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export function createDatabase(databasePath) {
  const directory = path.dirname(databasePath);
  fs.mkdirSync(directory, { recursive: true });

  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'practitioner',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      target TEXT,
      description TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
  `);

  migrateUsers(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS imaging_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      examination TEXT NOT NULL,
      modality TEXT NOT NULL,
      reference TEXT,
      assigned_user_id INTEGER,
      status TEXT NOT NULL DEFAULT 'scheduled',
      notes TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY (assigned_user_id) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      resource TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_by INTEGER,
      reviewed_at TEXT,
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_schedule_date ON imaging_schedule(scheduled_date, scheduled_time);
    CREATE INDEX IF NOT EXISTS idx_schedule_status ON imaging_schedule(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
  `);

  return db;
}

// Additive, idempotent migration: existing rows keep their data and default to an active, unrestricted account.
function migrateUsers(db) {
  const existing = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
  const columns = [
    ['full_name', 'TEXT'],
    ['email', 'TEXT'],
    ['department', 'TEXT'],
    ['status', "TEXT NOT NULL DEFAULT 'active'"],
    ['restricted', 'INTEGER NOT NULL DEFAULT 0'],
    ['restriction_reason', 'TEXT'],
    ['updated_at', 'TEXT'],
    ['last_login_at', 'TEXT'],
  ];

  for (const [name, definition] of columns) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
    }
  }
}
