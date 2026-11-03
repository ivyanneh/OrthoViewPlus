import { AppError, cleanText } from '../utils/http.js';

const SELECT = `
  SELECT r.id, r.patient_id AS patientId, r.appointment_id AS appointmentId,
         r.requested_by AS requestedBy, r.assigned_radiologist_id AS assignedRadiologistId,
         r.examination, r.modality, r.priority, r.clinical_indication AS clinicalIndication,
         r.status, r.created_at AS createdAt, r.updated_at AS updatedAt,
         p.mrn, p.first_name AS firstName, p.last_name AS lastName,
         requester.username AS requestedByUsername,
         COALESCE(radiologist.full_name, radiologist.username) AS assignedRadiologist
  FROM imaging_requests r
  JOIN patients p ON p.id = r.patient_id
  LEFT JOIN users requester ON requester.id = r.requested_by
  LEFT JOIN users radiologist ON radiologist.id = r.assigned_radiologist_id
`;

export function createRequestService(db, { notifications } = {}) {
  const getById = db.prepare(`${SELECT} WHERE r.id = ?`);

  function get(id) {
    return getById.get(Number(id)) ?? null;
  }

  function list({ status, patientId, assignedRadiologistId, assignedRadiologistOnly = false, requestedBy, limit = 200 } = {}) {
    const clauses = [];
    const params = { limit: Math.min(Math.max(Number(limit) || 200, 1), 500) };
    if (status && status !== 'all') {
      clauses.push('r.status = @status');
      params.status = status;
    }
    if (patientId) {
      clauses.push('r.patient_id = @patientId');
      params.patientId = Number(patientId);
    }
    if (assignedRadiologistId) {
      clauses.push(assignedRadiologistOnly
        ? 'r.assigned_radiologist_id = @assignedRadiologistId'
        : '(r.assigned_radiologist_id = @assignedRadiologistId OR r.assigned_radiologist_id IS NULL)');
      params.assignedRadiologistId = Number(assignedRadiologistId);
    }
    if (requestedBy) {
      clauses.push('r.requested_by = @requestedBy');
      params.requestedBy = Number(requestedBy);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return db.prepare(`${SELECT} ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT @limit`).all(params);
  }

  return {
    get,
    list,

    create({ patientId, requestedBy, appointmentId, examination, modality, priority = 'routine', clinicalIndication, assignedRadiologistId }) {
      const patient = db.prepare('SELECT id, first_name, last_name FROM patients WHERE id = ? AND status = ?').get(Number(patientId), 'active');
      if (!patient) {
        throw new AppError('Patient not found or archived.', 404);
      }
      const exam = cleanText(examination, 120);
      const mod = String(modality || '').trim().toUpperCase();
      if (!exam || !mod) {
        throw new AppError('Examination and modality are required.');
      }
      if (!['routine', 'urgent'].includes(priority)) {
        throw new AppError('Priority must be routine or urgent.');
      }
      const result = db
        .prepare(
          `INSERT INTO imaging_requests (
             patient_id, appointment_id, requested_by, assigned_radiologist_id,
             examination, modality, priority, clinical_indication, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .run(
          patient.id,
          appointmentId ? Number(appointmentId) : null,
          requestedBy,
          assignedRadiologistId ? Number(assignedRadiologistId) : null,
          exam,
          mod,
          priority,
          cleanText(clinicalIndication, 500) ?? null,
        );

      notifications?.notifyRole('radiologist', {
        type: 'imaging_request',
        title: 'New imaging request',
        message: `${patient.first_name} ${patient.last_name}: ${exam} (${mod}).`,
        resourceType: 'imaging_request',
        resourceId: result.lastInsertRowid,
      });

      return get(result.lastInsertRowid);
    },

    setStatus(id, status) {
      const request = get(Number(id));
      if (!request) {
        throw new AppError('Imaging request not found.', 404);
      }
      const allowed = ['submitted', 'scheduled', 'in_progress', 'completed', 'cancelled'];
      if (!allowed.includes(status)) {
        throw new AppError('Invalid imaging request status.');
      }
      db.prepare(`UPDATE imaging_requests SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, request.id);
      return get(request.id);
    },

    assign(id, radiologistId) {
      const request = get(Number(id));
      if (!request) {
        throw new AppError('Imaging request not found.', 404);
      }
      if (!['submitted', 'scheduled'].includes(request.status)) {
        throw new AppError('Only submitted or scheduled requests can be claimed.', 409);
      }
      if (request.assignedRadiologistId && Number(request.assignedRadiologistId) !== Number(radiologistId)) {
        throw new AppError('This imaging request is already assigned to another radiologist.', 409);
      }
      db.prepare(
        `UPDATE imaging_requests SET assigned_radiologist_id = ?, status = CASE WHEN status = 'submitted' THEN 'in_progress' ELSE status END, updated_at = datetime('now')
         WHERE id = ? AND (assigned_radiologist_id IS NULL OR assigned_radiologist_id = ?)`,
      ).run(Number(radiologistId), request.id, Number(radiologistId));
      const assigned = get(request.id);
      if (Number(assigned.assignedRadiologistId) !== Number(radiologistId)) {
        throw new AppError('This imaging request was claimed by another radiologist.', 409);
      }
      return assigned;
    },
  };
}
