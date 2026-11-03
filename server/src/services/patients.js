import { AppError, cleanText } from '../utils/http.js';

const SELECT = `
  SELECT p.id, p.mrn, p.first_name AS firstName, p.last_name AS lastName,
         p.date_of_birth AS dateOfBirth, p.sex, p.notes, p.status,
         p.created_at AS createdAt, p.updated_at AS updatedAt,
         creator.username AS createdBy
  FROM patients p
  LEFT JOIN users creator ON creator.id = p.created_by
`;

export function createPatientService(db) {
  const getById = db.prepare(`${SELECT} WHERE p.id = ?`);

  function get(id) {
    return getById.get(Number(id)) ?? null;
  }

  function requirePatient(id) {
    const patient = get(id);
    if (!patient) {
      throw new AppError('Patient not found.', 404);
    }
    return patient;
  }

  function setStatus(id, status) {
    const patient = requirePatient(id);
    if (!['active', 'archived'].includes(status)) {
      throw new AppError('Patient status must be active or archived.');
    }
    db.prepare(`UPDATE patients SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, patient.id);
    return get(patient.id);
  }

  return {
    get,
    requirePatient,

    search({ query = '', status = 'active', limit = 50 } = {}) {
      const clauses = [];
      const params = { limit: Math.min(Math.max(Number(limit) || 50, 1), 200) };
      if (status && status !== 'all') {
        clauses.push('p.status = @status');
        params.status = status;
      }
      if (query) {
        clauses.push(`(
          CAST(p.id AS TEXT) LIKE @query OR
          LOWER(p.mrn) LIKE @query OR
          LOWER(p.first_name) LIKE @query OR
          LOWER(p.last_name) LIKE @query OR
          LOWER(p.first_name || ' ' || p.last_name) LIKE @query
        )`);
        params.query = `%${String(query).toLowerCase()}%`;
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      return db
        .prepare(`${SELECT} ${where} ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE LIMIT @limit`)
        .all(params);
    },

    create({ mrn, firstName, lastName, dateOfBirth, sex, notes, createdBy }) {
      const record = {
        mrn: cleanText(mrn, 40),
        firstName: cleanText(firstName, 80),
        lastName: cleanText(lastName, 80),
        dateOfBirth: cleanText(dateOfBirth, 10) ?? null,
        sex: cleanText(sex, 20) ?? null,
        notes: cleanText(notes, 500) ?? null,
      };
      if (!record.mrn || !record.firstName || !record.lastName) {
        throw new AppError('MRN, first name and last name are required.');
      }
      if (db.prepare('SELECT id FROM patients WHERE mrn = ?').get(record.mrn)) {
        throw new AppError('A patient with that MRN already exists.', 409);
      }
      let result;
      try {
        result = db
          .prepare(
            `INSERT INTO patients (mrn, first_name, last_name, date_of_birth, sex, notes, created_by, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          )
          .run(record.mrn, record.firstName, record.lastName, record.dateOfBirth, record.sex, record.notes, createdBy ?? null);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new AppError('A patient with that MRN already exists.', 409);
        }
        throw error;
      }
      return get(result.lastInsertRowid);
    },

    update(id, changes) {
      const patient = requirePatient(id);
      if (patient.status === 'archived') {
        throw new AppError('Archived patient records cannot be edited.', 409);
      }
      const next = {
        firstName: changes.firstName !== undefined ? cleanText(changes.firstName, 80) : patient.firstName,
        lastName: changes.lastName !== undefined ? cleanText(changes.lastName, 80) : patient.lastName,
        dateOfBirth: changes.dateOfBirth !== undefined ? cleanText(changes.dateOfBirth, 10) : patient.dateOfBirth,
        sex: changes.sex !== undefined ? cleanText(changes.sex, 20) : patient.sex,
        notes: changes.notes !== undefined ? cleanText(changes.notes, 500) : patient.notes,
      };
      if (!next.firstName || !next.lastName) {
        throw new AppError('First name and last name are required.');
      }
      db.prepare(
        `UPDATE patients SET first_name = ?, last_name = ?, date_of_birth = ?, sex = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(next.firstName, next.lastName, next.dateOfBirth, next.sex, next.notes, patient.id);
      return get(patient.id);
    },

    archive(id) {
      return setStatus(id, 'archived');
    },

    setStatus,

    count() {
      return db.prepare(`SELECT COUNT(*) AS total FROM patients WHERE status = 'active'`).get().total;
    },
  };
}
