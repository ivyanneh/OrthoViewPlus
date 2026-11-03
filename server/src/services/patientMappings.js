import { AppError, cleanText } from '../utils/http.js';

const SELECT = `
  SELECT m.id, m.patient_id AS patientId, m.orthanc_patient_id AS orthancPatientId,
         m.patient_name AS patientName, m.patient_birth_date AS patientBirthDate,
         m.verified_at AS verifiedAt, m.verified_by AS verifiedBy, m.status, m.notes,
         p.mrn, p.first_name AS firstName, p.last_name AS lastName,
         verifier.username AS verifiedByUsername
  FROM patient_dicom_mappings m
  JOIN patients p ON p.id = m.patient_id
  LEFT JOIN users verifier ON verifier.id = m.verified_by
`;

export function createPatientMappingService(db, { audit } = {}) {
  const getById = db.prepare(`${SELECT} WHERE m.id = ?`);

  function get(id) {
    return getById.get(Number(id)) ?? null;
  }

  function getByOrthancPatientId(orthancPatientId) {
    return db.prepare(`${SELECT} WHERE m.orthanc_patient_id = ? COLLATE NOCASE`).get(String(orthancPatientId)) ?? null;
  }

  function getByPatientId(patientId) {
    return db.prepare(`${SELECT} WHERE m.patient_id = ?`).all(Number(patientId));
  }

  function getVerifiedMapping(orthancPatientId) {
    return db.prepare(`${SELECT} WHERE m.orthanc_patient_id = ? COLLATE NOCASE AND m.status = 'verified'`).get(String(orthancPatientId)) ?? null;
  }

  return {
    get,
    getByOrthancPatientId,
    getByPatientId,
    getVerifiedMapping,

    list({ status, patientId, limit = 100 } = {}) {
      const clauses = [];
      const params = { limit: Math.min(Math.max(Number(limit) || 100, 1), 500) };
      if (status && status !== 'all') {
        clauses.push('m.status = @status');
        params.status = status;
      }
      if (patientId) {
        clauses.push('m.patient_id = @patientId');
        params.patientId = Number(patientId);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      return db.prepare(`${SELECT} ${where} ORDER BY m.verified_at DESC LIMIT @limit`).all(params);
    },

    create({ patientId, orthancPatientId, patientName, patientBirthDate, notes, verifiedBy }) {
      const patient = db.prepare('SELECT id, mrn FROM patients WHERE id = ? AND status = ?').get(Number(patientId), 'active');
      if (!patient) {
        throw new AppError('Patient not found or archived.', 404);
      }

      const existingVerified = db.prepare('SELECT id FROM patient_dicom_mappings WHERE orthanc_patient_id = ? COLLATE NOCASE AND status = ?').get(String(orthancPatientId), 'verified');
      if (existingVerified) {
        throw new AppError('This Orthanc PatientID is already verified to a different patient.', 409);
      }

      const existingPending = db.prepare('SELECT id FROM patient_dicom_mappings WHERE patient_id = ? AND orthanc_patient_id = ? COLLATE NOCASE').get(Number(patientId), String(orthancPatientId));
      if (existingPending) {
        return get(existingPending.id);
      }

      const result = db
        .prepare(
          `INSERT INTO patient_dicom_mappings (
             patient_id, orthanc_patient_id, patient_name, patient_birth_date, notes, verified_by, status
           ) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        )
        .run(
          patient.id,
          cleanText(orthancPatientId, 64),
          cleanText(patientName, 255) ?? null,
          cleanText(patientBirthDate, 10) ?? null,
          cleanText(notes, 500) ?? null,
          verifiedBy ?? null,
        );

      audit?.log({
        userId: verifiedBy,
        action: 'patient_mapping_created',
        target: `patient_mapping:${result.lastInsertRowid}`,
        description: `Created pending DICOM mapping for patient ${patient.mrn} to Orthanc PatientID ${orthancPatientId}.`,
      });

      return get(result.lastInsertRowid);
    },

    verify(id, verifiedBy) {
      const mapping = get(Number(id));
      if (!mapping) {
        throw new AppError('Patient mapping not found.', 404);
      }
      if (mapping.status === 'verified') {
        throw new AppError('This mapping is already verified.', 409);
      }
      if (mapping.status !== 'pending') {
        throw new AppError('Only pending mappings can be verified.', 409);
      }

      const existingVerified = db.prepare('SELECT id FROM patient_dicom_mappings WHERE orthanc_patient_id = ? COLLATE NOCASE AND status = ? AND id != ?').get(mapping.orthancPatientId, 'verified', mapping.id);
      if (existingVerified) {
        throw new AppError('This Orthanc PatientID is already verified to a different patient.', 409);
      }

      db.prepare(`UPDATE patient_dicom_mappings SET status = 'verified', verified_by = ?, verified_at = datetime('now') WHERE id = ?`).run(verifiedBy, mapping.id);

      audit?.log({
        userId: verifiedBy,
        action: 'patient_mapping_verified',
        target: `patient_mapping:${mapping.id}`,
        description: `Verified DICOM mapping for patient ${mapping.mrn} to Orthanc PatientID ${mapping.orthancPatientId}.`,
      });

      return get(mapping.id);
    },

    reject(id, verifiedBy, notes) {
      const mapping = get(Number(id));
      if (!mapping) {
        throw new AppError('Patient mapping not found.', 404);
      }
      if (mapping.status === 'rejected') {
        throw new AppError('This mapping is already rejected.', 409);
      }
      if (mapping.status !== 'pending') {
        throw new AppError('Only pending mappings can be rejected.', 409);
      }

      db.prepare(`UPDATE patient_dicom_mappings SET status = 'rejected', verified_by = ?, notes = ?, verified_at = datetime('now') WHERE id = ?`).run(
        verifiedBy,
        cleanText(notes, 500) ?? null,
        mapping.id,
      );

      audit?.log({
        userId: verifiedBy,
        action: 'patient_mapping_rejected',
        target: `patient_mapping:${mapping.id}`,
        description: `Rejected DICOM mapping for patient ${mapping.mrn} to Orthanc PatientID ${mapping.orthancPatientId}.`,
      });

      return get(mapping.id);
    },
  };
}
