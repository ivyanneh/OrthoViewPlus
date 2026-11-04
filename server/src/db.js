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
  migratePatientMappings(db);

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

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mrn TEXT NOT NULL UNIQUE COLLATE NOCASE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth TEXT,
      sex TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      examination TEXT NOT NULL,
      modality TEXT NOT NULL,
      assigned_user_id INTEGER,
      requested_by INTEGER,
      status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'completed', 'cancelled', 'missed')),
      notes TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      completed_at TEXT,
      missed_at TEXT,
      grace_alert_sent INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (assigned_user_id) REFERENCES users(id),
      FOREIGN KEY (requested_by) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS imaging_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      appointment_id INTEGER,
      requested_by INTEGER NOT NULL,
      assigned_radiologist_id INTEGER,
      examination TEXT NOT NULL,
      modality TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent')),
      clinical_indication TEXT,
      status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'scheduled', 'in_progress', 'completed', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (appointment_id) REFERENCES appointments(id),
      FOREIGN KEY (requested_by) REFERENCES users(id),
      FOREIGN KEY (assigned_radiologist_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS imaging_studies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER,
      appointment_id INTEGER,
      imaging_request_id INTEGER,
      orthanc_study_id TEXT,
      study_instance_uid TEXT,
      study_date TEXT,
      modality TEXT,
      description TEXT,
      source TEXT NOT NULL DEFAULT 'original'
        CHECK (source IN ('original', 'ai_derived', 'synthetic')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (appointment_id) REFERENCES appointments(id),
      FOREIGN KEY (imaging_request_id) REFERENCES imaging_requests(id)
    );

    CREATE TABLE IF NOT EXISTS radiology_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imaging_study_id INTEGER,
      patient_id INTEGER NOT NULL,
      imaging_request_id INTEGER,
      radiologist_id INTEGER NOT NULL,
      findings TEXT,
      impression TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      approved_at TEXT,
      FOREIGN KEY (imaging_study_id) REFERENCES imaging_studies(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (imaging_request_id) REFERENCES imaging_requests(id),
      FOREIGN KEY (radiologist_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ai_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      capability TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed')),
      requested_by INTEGER NOT NULL,
      patient_id INTEGER,
      source_study_id INTEGER,
      orthanc_instance_id TEXT,
      input_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (requested_by) REFERENCES users(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (source_study_id) REFERENCES imaging_studies(id)
    );

    CREATE TABLE IF NOT EXISTS ai_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      capability TEXT NOT NULL,
      source_study_id INTEGER,
      result_kind TEXT NOT NULL,
      file_path TEXT,
      overlay_path TEXT,
      metadata_json TEXT,
      label TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (review_status IN ('pending_review', 'reviewed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES ai_jobs(id),
      FOREIGN KEY (source_study_id) REFERENCES imaging_studies(id)
    );

    CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(mrn);
    CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(last_name, first_name);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(scheduled_date, scheduled_time);
    CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
    CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
    CREATE INDEX IF NOT EXISTS idx_requests_patient ON imaging_requests(patient_id);
    CREATE INDEX IF NOT EXISTS idx_requests_status ON imaging_requests(status);
    CREATE INDEX IF NOT EXISTS idx_studies_patient ON imaging_studies(patient_id);
    CREATE INDEX IF NOT EXISTS idx_studies_orthanc ON imaging_studies(orthanc_study_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_studies_orthanc_unique ON imaging_studies(orthanc_study_id)
      WHERE orthanc_study_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_reports_patient ON radiology_reports(patient_id);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON radiology_reports(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_results_job ON ai_results(job_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_results_job_unique ON ai_results(job_id);
  `);

  migrateAiJobs(db);
  return db;
}

// Additive, idempotent migration: existing rows keep their data and default to an active, unrestricted account.
function migrateUsers(db) {
  const existing = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
  const columns = [
    ['full_name', 'TEXT'],
    ['email', 'TEXT'],
    ['phone', 'TEXT'],
    ['professional_title', 'TEXT'],
    ['specialisation', 'TEXT'],
    ['department', 'TEXT'],
    ['facility', 'TEXT'],
    ['registration_number', 'TEXT'],
    ['status', "TEXT NOT NULL DEFAULT 'active'"],
    ['restricted', 'INTEGER NOT NULL DEFAULT 0'],
    ['restriction_reason', 'TEXT'],
    ['updated_at', 'TEXT'],
    ['last_login_at', 'TEXT'],
    ['token_version', 'INTEGER NOT NULL DEFAULT 0'],
    ['theme_preference', "TEXT DEFAULT 'light'"],
    ['notification_preference', 'INTEGER NOT NULL DEFAULT 1'],
  ];

  for (const [name, definition] of columns) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
    }
  }
}

// Additive, idempotent migration: create patient DICOM mapping table for verified identity verification
function migratePatientMappings(db) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  if (!tables.has('patient_dicom_mappings')) {
    db.exec(`
      CREATE TABLE patient_dicom_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        orthanc_patient_id TEXT NOT NULL,
        patient_name TEXT,
        patient_birth_date TEXT,
        verified_at TEXT NOT NULL DEFAULT (datetime('now')),
        verified_by INTEGER,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('verified', 'rejected', 'pending')),
        notes TEXT,
        FOREIGN KEY (patient_id) REFERENCES patients(id),
        FOREIGN KEY (verified_by) REFERENCES users(id),
        UNIQUE(patient_id, orthanc_patient_id)
      );

      CREATE INDEX idx_mappings_patient ON patient_dicom_mappings(patient_id);
      CREATE INDEX idx_mappings_orthanc ON patient_dicom_mappings(orthanc_patient_id);
      CREATE UNIQUE INDEX idx_mappings_orthanc_global ON patient_dicom_mappings(orthanc_patient_id) WHERE status = 'verified';
    `);
  }
}

// Additive, idempotent migration: add retry tracking to ai_jobs
function migrateAiJobs(db) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  if (!tables.has('ai_jobs')) {
    return;
  }
  const columns = new Set(db.prepare('PRAGMA table_info(ai_jobs)').all().map((column) => column.name));
  if (!columns.has('retry_count')) {
    db.exec(`ALTER TABLE ai_jobs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columns.has('last_retry_at')) {
    db.exec(`ALTER TABLE ai_jobs ADD COLUMN last_retry_at TEXT`);
  }
}
