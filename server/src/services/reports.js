import { AppError, cleanText } from '../utils/http.js';

const SELECT = `
  SELECT r.id, r.imaging_study_id AS imagingStudyId, r.patient_id AS patientId,
         r.imaging_request_id AS imagingRequestId, r.radiologist_id AS radiologistId,
         r.findings, r.impression, r.status, r.created_at AS createdAt, r.updated_at AS updatedAt,
         r.approved_at AS approvedAt,
         p.mrn, p.first_name AS firstName, p.last_name AS lastName,
         COALESCE(rad.full_name, rad.username) AS radiologistName
  FROM radiology_reports r
  JOIN patients p ON p.id = r.patient_id
  LEFT JOIN users rad ON rad.id = r.radiologist_id
`;

export function createReportService(db, { notifications } = {}) {
  const getById = db.prepare(`${SELECT} WHERE r.id = ?`);

  function get(id) {
    return getById.get(Number(id)) ?? null;
  }

  function list({ patientId, status, radiologistId, limit = 100 } = {}) {
    const clauses = [];
    const params = { limit: Math.min(Math.max(Number(limit) || 100, 1), 300) };
    if (patientId) {
      clauses.push('r.patient_id = @patientId');
      params.patientId = Number(patientId);
    }
    if (status && status !== 'all') {
      clauses.push('r.status = @status');
      params.status = status;
    }
    if (radiologistId) {
      clauses.push('r.radiologist_id = @radiologistId');
      params.radiologistId = Number(radiologistId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return db.prepare(`${SELECT} ${where} ORDER BY r.updated_at DESC, r.id DESC LIMIT @limit`).all(params);
  }

  return {
    get,
    list,

    saveDraft({ id, patientId, imagingStudyId, imagingRequestId, radiologistId, findings, impression }) {
      const payload = {
        findings: cleanText(findings, 8000) ?? '',
        impression: cleanText(impression, 4000) ?? '',
      };
      if (id) {
        const existing = get(Number(id));
        if (!existing) {
          throw new AppError('Report not found.', 404);
        }
        if (existing.status === 'approved') {
          throw new AppError('Approved reports cannot be edited.', 409);
        }
        if (Number(existing.radiologistId) !== Number(radiologistId)) {
          throw new AppError('You can only edit your own draft reports.', 403);
        }
        db.prepare(
          `UPDATE radiology_reports SET findings = ?, impression = ?, imaging_study_id = ?, updated_at = datetime('now') WHERE id = ?`,
        ).run(payload.findings, payload.impression, imagingStudyId ? Number(imagingStudyId) : existing.imagingStudyId, existing.id);
        return get(existing.id);
      }

      const patient = db.prepare('SELECT id FROM patients WHERE id = ?').get(Number(patientId));
      if (!patient) {
        throw new AppError('Patient not found.', 404);
      }
      const result = db
        .prepare(
          `INSERT INTO radiology_reports (
             imaging_study_id, patient_id, imaging_request_id, radiologist_id, findings, impression, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .run(
          imagingStudyId ? Number(imagingStudyId) : null,
          patient.id,
          imagingRequestId ? Number(imagingRequestId) : null,
          radiologistId,
          payload.findings,
          payload.impression,
        );
      return get(result.lastInsertRowid);
    },

    approve(id, radiologistId) {
      const report = get(Number(id));
      if (!report) {
        throw new AppError('Report not found.', 404);
      }
      if (report.status === 'approved') {
        throw new AppError('This report is already approved.', 409);
      }
      if (Number(report.radiologistId) !== Number(radiologistId)) {
        throw new AppError('Only the authoring radiologist can approve this report.', 403);
      }
      if (!report.findings && !report.impression) {
        throw new AppError('Add findings or an impression before approving.');
      }
      db.prepare(
        `UPDATE radiology_reports SET status = 'approved', approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      ).run(report.id);

      notifications?.notifyRole('practitioner', {
        type: 'report_ready',
        title: 'Radiology report available',
        message: `An approved report is available for ${report.firstName} ${report.lastName}.`,
        resourceType: 'report',
        resourceId: report.id,
      });

      return get(report.id);
    },
  };
}
