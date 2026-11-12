import bcrypt from 'bcryptjs';

function upsertUser(db, { username, password, role, fullName, department }) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return { created: false, id: existing.id };
  }
  const result = db
    .prepare(
      `INSERT INTO users (username, password_hash, role, full_name, department, status, restricted, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', 0, datetime('now'))`,
    )
    .run(username, bcrypt.hashSync(password, 10), role, fullName, department);
  return { created: true, id: result.lastInsertRowid };
}

export function seedDevelopmentAdmin(db, { username, password }) {
  if (!username || !password) {
    return { created: false, reason: 'missing-credentials' };
  }
  return upsertUser(db, {
    username,
    password,
    role: 'administrator',
    fullName: 'Development Administrator',
    department: 'Administration',
  });
}

export function seedDemoAccounts(db, accounts = {}) {
  const created = [];
  if (accounts.adminUsername && accounts.adminPassword) {
    created.push(
      seedDevelopmentAdmin(db, { username: accounts.adminUsername, password: accounts.adminPassword }),
    );
  }
  if (accounts.practitionerUsername && accounts.practitionerPassword) {
    created.push(
      upsertUser(db, {
        username: accounts.practitionerUsername,
        password: accounts.practitionerPassword,
        role: 'practitioner',
        fullName: 'Demo Practitioner',
        department: 'Outpatients',
      }),
    );
  }
  if (accounts.radiologistUsername && accounts.radiologistPassword) {
    created.push(
      upsertUser(db, {
        username: accounts.radiologistUsername,
        password: accounts.radiologistPassword,
        role: 'radiologist',
        fullName: 'Demo Radiologist',
        department: 'Radiology',
      }),
    );
  }
  return created;
}

export function seedDemoClinicalData(db, { practitionerUsername, radiologistUsername } = {}) {
  const resolveRoleUser = (role, username) => {
    if (username) {
      return db.prepare(
        `SELECT id FROM users WHERE role = ? AND username = ? COLLATE NOCASE
           AND status = 'active' AND restricted = 0`,
      ).get(role, username) ?? null;
    }
    const users = db.prepare(
      `SELECT id FROM users WHERE role = ? AND status = 'active' AND restricted = 0`,
    ).all(role);
    return users.length >= 1 ? users[0] : null;
  };

  const practitioner = resolveRoleUser('practitioner', practitionerUsername);
  const radiologist = resolveRoleUser('radiologist', radiologistUsername);

  return db.transaction(() => {
    const admin = resolveRoleUser('administrator');
    const createdBy = admin?.id ?? practitioner?.id ?? 1;

    // 1. Seed 2 Distinct Demo Patients
    const insertPatient = db.prepare(
      `INSERT INTO patients (mrn, first_name, last_name, date_of_birth, sex, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(mrn) DO NOTHING`,
    );
    insertPatient.run('DEMO-CHEST-001', 'Amina', 'Demo', '1978-04-12', 'F', 'Fictional demonstration record for chest radiography workflows. Not a real patient.', createdBy);
    insertPatient.run('DEMO-FOOT-002', 'Joseph', 'Demo', '1969-11-03', 'M', 'Fictional demonstration record for extremity coverage assessment. Not a real patient.', createdBy);

    const getPatientId = db.prepare('SELECT id FROM patients WHERE mrn = ?');
    const chestId = getPatientId.get('DEMO-CHEST-001')?.id;
    const footId = getPatientId.get('DEMO-FOOT-002')?.id;

    // 4. Seed Appointments (Includes Today's Appointment so Practitioner Dashboard != 0)
    const createdAppointments = [];
    const appointmentSpecs = [
      [chestId, '+0 day', '09:30', 'Chest PA', 'DX', 'scheduled', 'Today scheduled chest examination.'],
      [footId, '+0 day', '11:00', 'Right Foot AP', 'DX', 'scheduled', 'Today scheduled extremity examination.'],
      [footId, '-1 day', '14:00', 'Foot AP', 'DX', 'completed', 'Demo completed examination.'],
      [chestId, '-3 day', '11:15', 'Chest PA', 'DX', 'missed', 'Demo missed examination.'],
    ];

    if (practitioner) {
      const findAppointment = db.prepare(
        `SELECT id FROM appointments WHERE patient_id = ? AND examination = ? AND modality = ?
          AND requested_by = ? AND notes = ? LIMIT 1`,
      );
      const insertAppointment = db.prepare(
        `INSERT INTO appointments (patient_id, scheduled_date, scheduled_time, examination, modality, assigned_user_id, requested_by, status, notes, created_by)
         VALUES (?, date('now', ?), ?, ?, ?, NULL, ?, ?, ?, ?)`,
      );

      for (const [patientId, offset, time, examination, modality, status, notes] of appointmentSpecs) {
        if (!patientId) continue;
        let appointment = findAppointment.get(patientId, examination, modality, practitioner.id, notes);
        if (!appointment) {
          const result = insertAppointment.run(patientId, offset, time, examination, modality, practitioner.id, status, notes, createdBy);
          appointment = { id: result.lastInsertRowid };
          createdAppointments.push(appointment.id);
        }
      }

      // 5. Seed Imaging Requests (Routine + STAT)
      const chestAppointment = findAppointment.get(chestId, 'Chest PA', 'DX', practitioner.id, 'Today scheduled chest examination.');
      const existingRequest = db.prepare(
        `SELECT id FROM imaging_requests WHERE patient_id = ? AND examination = 'Chest PA' LIMIT 1`,
      ).get(chestId);

      if (!existingRequest && chestId) {
        db.prepare(
          `INSERT INTO imaging_requests (patient_id, appointment_id, requested_by, assigned_radiologist_id, examination, modality, priority, clinical_indication, status)
           VALUES (?, ?, ?, ?, 'Chest PA', 'DX', 'routine', 'Persistent cough evaluation.', 'submitted')`,
        ).run(chestId, chestAppointment?.id ?? null, practitioner.id, radiologist?.id ?? null);
      }

      const existingStatRequest = db.prepare(
        `SELECT id FROM imaging_requests WHERE patient_id = ? AND priority = 'stat' LIMIT 1`,
      ).get(footId);

      if (!existingStatRequest && footId) {
        db.prepare(
          `INSERT INTO imaging_requests (patient_id, appointment_id, requested_by, assigned_radiologist_id, examination, modality, priority, clinical_indication, status)
           VALUES (?, NULL, ?, ?, 'Right Foot AP/Oblique', 'DX', 'urgent', 'Acute trauma / suspected metatarsal fracture.', 'in_progress')`,
        ).run(footId, practitioner.id, radiologist?.id ?? null);
      }
    }

    const warnings = [];
    if (!practitioner) warnings.push('No active Practitioner found; demo appointments skipped.');
    if (!radiologist) warnings.push('No active Radiologist found; requests unassigned.');
    return { seeded: true, createdAppointments, assigned: Boolean(radiologist), warnings };
  })();
}