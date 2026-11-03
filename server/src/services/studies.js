import { AppError } from '../utils/http.js';

const SELECT = `
  SELECT s.id, s.patient_id AS patientId, s.appointment_id AS appointmentId,
         s.imaging_request_id AS imagingRequestId, s.orthanc_study_id AS orthancStudyId,
         s.study_instance_uid AS studyInstanceUid, s.study_date AS studyDate,
         s.modality, s.description, s.source, s.created_at AS createdAt,
         p.mrn, p.first_name AS firstName, p.last_name AS lastName
  FROM imaging_studies s
  LEFT JOIN patients p ON p.id = s.patient_id
`;

const REQUEST_MODALITY_CODES = {
  MRI: ['MR'],
  'X-RAY': ['CR', 'DX', 'XR', 'RF'],
  XR: ['CR', 'DX', 'XR', 'RF'],
};

function modalities(value) {
  return String(value || '')
    .split(/[\\,]/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function requestMatchesStudyModality(requestModality, studyModality) {
  const studyCodes = new Set(modalities(studyModality));
  const requestedCodes = modalities(requestModality).flatMap(
    (code) => REQUEST_MODALITY_CODES[code] || [code],
  );
  return studyCodes.size > 0 && requestedCodes.some((code) => studyCodes.has(code));
}

export function createStudyService(db) {
  const linkOrthancStudy = db.transaction(({
    patientId,
    imagingRequestId,
    orthancStudyId,
    studyInstanceUid,
    studyDate,
    modality,
    description,
  }) => {
    const request = db.prepare(
      'SELECT id, patient_id, modality FROM imaging_requests WHERE id = ? AND status != ?',
    ).get(Number(imagingRequestId), 'cancelled');
    if (!request || Number(request.patient_id) !== Number(patientId)) {
      throw new AppError('The imaging request does not match the verified study patient.', 409);
    }
    if (!requestMatchesStudyModality(request.modality, modality)) {
      throw new AppError('The imaging request modality does not match the Orthanc study.', 409);
    }

    const existing = db.prepare(
      'SELECT id, patient_id, imaging_request_id FROM imaging_studies WHERE orthanc_study_id = ?',
    ).get(String(orthancStudyId));
    if (existing) {
      if (Number(existing.patient_id) !== Number(patientId)) {
        throw new AppError('This Orthanc study is already linked to a different patient.', 409);
      }
      if (existing.imaging_request_id && Number(existing.imaging_request_id) !== Number(imagingRequestId)) {
        throw new AppError('This Orthanc study is already linked to a different imaging request.', 409);
      }
      db.prepare(
        `UPDATE imaging_studies
         SET imaging_request_id = ?, study_instance_uid = COALESCE(study_instance_uid, ?),
             study_date = COALESCE(study_date, ?), modality = COALESCE(modality, ?),
             description = COALESCE(description, ?)
         WHERE id = ?`,
      ).run(
        Number(imagingRequestId),
        studyInstanceUid ?? null,
        studyDate ?? null,
        modality ?? null,
        description ?? null,
        existing.id,
      );
      return db.prepare(`${SELECT} WHERE s.id = ?`).get(existing.id);
    }

    const result = db.prepare(
      `INSERT INTO imaging_studies (
         patient_id, imaging_request_id, orthanc_study_id, study_instance_uid,
         study_date, modality, description, source
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'original')`,
    ).run(
      Number(patientId),
      Number(imagingRequestId),
      String(orthancStudyId),
      studyInstanceUid ?? null,
      studyDate ?? null,
      modality ?? null,
      description ?? null,
    );
    return db.prepare(`${SELECT} WHERE s.id = ?`).get(result.lastInsertRowid);
  });

  return {
    get(id) {
      return db.prepare(`${SELECT} WHERE s.id = ?`).get(Number(id)) ?? null;
    },

    getByOrthancStudyId(orthancStudyId) {
      return db.prepare(`${SELECT} WHERE s.orthanc_study_id = ?`).get(String(orthancStudyId)) ?? null;
    },

    getLinkedRequestForOrthancStudy(orthancStudyId) {
      return db.prepare(
        `SELECT r.id, r.status, r.examination, r.modality
         FROM imaging_studies s
         JOIN imaging_requests r
           ON r.id = s.imaging_request_id
          AND r.patient_id = s.patient_id
         WHERE s.orthanc_study_id = ?`,
      ).get(String(orthancStudyId)) ?? null;
    },

    linkOrthancStudy,

    isAssignedToRadiologist(orthancStudyId, radiologistId) {
      return Boolean(db.prepare(
        `SELECT 1
         FROM imaging_studies s
         JOIN imaging_requests r
           ON r.id = s.imaging_request_id
          AND r.patient_id = s.patient_id
         WHERE s.orthanc_study_id = ?
           AND r.assigned_radiologist_id = ?
           AND r.status != 'cancelled'
         LIMIT 1`,
      ).get(String(orthancStudyId), Number(radiologistId)));
    },

    isAssignedToPractitioner(orthancStudyId, practitionerId) {
      return Boolean(db.prepare(
        `SELECT 1
         FROM imaging_studies s
         JOIN imaging_requests r
           ON r.id = s.imaging_request_id
          AND r.patient_id = s.patient_id
         LEFT JOIN appointments a
           ON a.id = r.appointment_id
          AND a.patient_id = r.patient_id
         WHERE s.orthanc_study_id = ?
           AND r.status != 'cancelled'
           AND (r.requested_by = ? OR a.assigned_user_id = ?)
         LIMIT 1`,
      ).get(String(orthancStudyId), Number(practitionerId), Number(practitionerId)));
    },

    isInternalStudyAssignedToRadiologist(studyId, radiologistId) {
      return Boolean(db.prepare(
        `SELECT 1
         FROM imaging_studies s
         JOIN imaging_requests r
           ON r.id = s.imaging_request_id
          AND r.patient_id = s.patient_id
         WHERE s.id = ?
           AND r.assigned_radiologist_id = ?
           AND r.status != 'cancelled'
         LIMIT 1`,
      ).get(Number(studyId), Number(radiologistId)));
    },

    list({ patientId, source = 'original' } = {}) {
      const clauses = [];
      const params = {};
      if (patientId) {
        clauses.push('s.patient_id = @patientId');
        params.patientId = Number(patientId);
      }
      if (source && source !== 'all') {
        clauses.push('s.source = @source');
        params.source = source;
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      return db.prepare(`${SELECT} ${where} ORDER BY s.study_date DESC, s.id DESC`).all(params);
    },

    upsertOrthancStudy({ patientId, appointmentId, imagingRequestId, orthancStudyId, studyInstanceUid, studyDate, modality, description }) {
      const existing = db.prepare('SELECT id FROM imaging_studies WHERE orthanc_study_id = ?').get(orthancStudyId);
      if (existing) {
        return db.prepare(`${SELECT} WHERE s.id = ?`).get(existing.id);
      }
      const result = db
        .prepare(
          `INSERT INTO imaging_studies (
             patient_id, appointment_id, imaging_request_id, orthanc_study_id,
             study_instance_uid, study_date, modality, description, source
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'original')`,
        )
        .run(
          patientId ?? null,
          appointmentId ?? null,
          imagingRequestId ?? null,
          orthancStudyId,
          studyInstanceUid ?? null,
          studyDate ?? null,
          modality ?? null,
          description ?? null,
        );
      return db.prepare(`${SELECT} WHERE s.id = ?`).get(result.lastInsertRowid);
    },
  };
}
