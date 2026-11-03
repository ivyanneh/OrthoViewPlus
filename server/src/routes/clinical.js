import { Router } from 'express';
import { AppError, handleRoute } from '../utils/http.js';

export function createClinicalRouter({
  patients,
  appointments,
  requests,
  reports,
  studies,
  notifications,
  audit,
  users,
}) {
  const router = Router();

  function log(req, action, target, description) {
    audit.log({
      userId: req.user?.id ?? null,
      action,
      target,
      description: `User "${req.user?.username ?? 'unknown'}" ${description}`,
    });
  }

  function requirePractitionerPatientAccess(req, patientId) {
    const patient = patients.requirePatient(patientId);
    if (req.user.role !== 'practitioner') return patient;

    const ownsPatient = patient.createdBy === req.user.username;
    const hasRequest = requests.list({
      patientId: patient.id,
      requestedBy: req.user.id,
      limit: 500,
    }).length > 0;
    const hasAppointment = appointments.list({
      patientId: patient.id,
      accessibleToUserId: req.user.id,
      limit: 500,
    }).length > 0;
    if (!ownsPatient && !hasRequest && !hasAppointment) {
      throw new AppError('Patient records are available only for patients in your clinical workflow.', 403);
    }
    return patient;
  }

  router.get(
    '/patients',
    handleRoute((req, res) => {
      let patientList = patients.search({
        query: req.query.q,
        status: req.query.status || 'active',
        limit: req.query.limit,
      });
      if (req.user.role === 'radiologist') {
        const assignedPatientIds = new Set(
          requests.list({
            assignedRadiologistId: req.user.id,
            assignedRadiologistOnly: true,
            limit: 500,
          }).map((request) => Number(request.patientId)),
        );
        patientList = patientList.filter((patient) => assignedPatientIds.has(Number(patient.id)));
      } else if (req.user.role === 'administrator') {
        throw new AppError('Use the administrator patient-management workflow for patient records.', 403);
      }
      if (req.user.role === 'practitioner') {
        const accessiblePatientIds = new Set([
          ...requests.list({ requestedBy: req.user.id, limit: 500 }).map((request) => Number(request.patientId)),
          ...appointments.list({ accessibleToUserId: req.user.id, limit: 500 }).map((appointment) => Number(appointment.patientId)),
        ]);
        patientList = patientList.filter(
          (patient) => accessiblePatientIds.has(Number(patient.id)) || patient.createdBy === req.user.username,
        );
      }
      res.json({ patients: patientList });
    }),
  );

  router.post(
    '/patients',
    handleRoute((req, res) => {
      if (req.user.role !== 'practitioner') {
        return res.status(403).json({ error: 'Only practitioners can register patients through clinical workflow.' });
      }
      const patient = patients.create({ ...req.body, createdBy: req.user.id });
      log(req, 'patient_create', `patient:${patient.id}`, `registered patient ${patient.mrn}.`);
      res.status(201).json({ patient });
    }),
  );

  router.get(
    '/patients/:id',
    handleRoute((req, res) => {
      if (req.user.role === 'administrator') {
        throw new AppError('Administrators do not have access to clinical patient history.', 403);
      }
      const patient = patients.requirePatient(req.params.id);
      let authorizedRequest = null;
      if (req.user.role === 'practitioner') {
        requirePractitionerPatientAccess(req, patient.id);
      }
      if (req.user.role === 'radiologist') {
        authorizedRequest = requests.get(req.query.requestId);
        if (
          !authorizedRequest ||
          Number(authorizedRequest.patientId) !== Number(patient.id) ||
          Number(authorizedRequest.assignedRadiologistId) !== Number(req.user.id)
        ) {
          throw new AppError('Patient history requires an imaging request assigned to you.', 403);
        }
      }
      let patientStudies = studies.list({ patientId: patient.id, source: 'all' });
      let patientReports = reports.list({
        patientId: patient.id,
        status: req.user.role === 'practitioner' ? 'approved' : 'all',
      });
      let patientRequests = requests.list({ patientId: patient.id });
      let patientAppointments = appointments.list({ patientId: patient.id });
      if (req.user.role === 'radiologist') {
        patientStudies = patientStudies.filter((study) =>
          studies.isInternalStudyAssignedToRadiologist(study.id, req.user.id),
        );
        const studyIds = new Set(patientStudies.map((study) => Number(study.id)));
        patientReports = patientReports.filter((report) =>
          Number(report.radiologistId) === Number(req.user.id) &&
          studyIds.has(Number(report.imagingStudyId)),
        );
        patientRequests = authorizedRequest ? [authorizedRequest] : [];
        patientAppointments = patientAppointments.filter((appointment) =>
          Number(appointment.id) === Number(authorizedRequest?.appointmentId),
        );
      } else if (req.user.role === 'practitioner') {
        patientStudies = patientStudies.filter((study) =>
          studies.isAssignedToPractitioner(study.orthancStudyId, req.user.id),
        );
        const studyIds = new Set(patientStudies.map((study) => Number(study.id)));
        patientReports = patientReports.filter(
          (report) => report.imagingStudyId && studyIds.has(Number(report.imagingStudyId)),
        );
        patientRequests = requests.list({
          patientId: patient.id,
          requestedBy: req.user.id,
          limit: 500,
        });
        patientAppointments = appointments.list({
          patientId: patient.id,
          accessibleToUserId: req.user.id,
          limit: 500,
        });
      }
      const history = {
        appointments: patientAppointments,
        requests: patientRequests,
        studies: patientStudies,
        reports: patientReports,
      };
      log(req, 'patient_view', `patient:${patient.id}`, `viewed patient ${patient.mrn}.`);
      res.json({ patient, history });
    }),
  );

  router.patch(
    '/patients/:id',
    handleRoute((req, res) => {
      if (req.user.role !== 'administrator') {
        return res.status(403).json({ error: 'You do not have permission to edit patient records.' });
      }
      const patient = patients.update(req.params.id, req.body || {});
      log(req, 'patient_update', `patient:${patient.id}`, `updated patient ${patient.mrn}.`);
      res.json({ patient });
    }),
  );

  router.get(
    '/appointments',
    handleRoute((req, res) => {
      const filters = {
        status: req.query.status,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        patientId: req.query.patientId,
      };
      if (req.user.role === 'practitioner') {
        filters.accessibleToUserId = req.user.id;
      } else if (req.user.role === 'radiologist') {
        filters.appointmentIds = requests.list({
          assignedRadiologistId: req.user.id,
          assignedRadiologistOnly: true,
          limit: 500,
        }).map((request) => request.appointmentId).filter(Boolean);
      }
      res.json({
        appointments: appointments.list(filters),
        counts: req.user.role === 'administrator' ? appointments.counts() : undefined,
      });
    }),
  );

  router.post(
    '/appointments',
    handleRoute((req, res) => {
      if (req.user.role !== 'administrator' && req.user.role !== 'practitioner') {
        return res.status(403).json({ error: 'You do not have permission to schedule appointments.' });
      }
      if (req.user.role === 'practitioner') {
        requirePractitionerPatientAccess(req, req.body?.patientId);
      }
      if (req.body?.assignedUserId) {
        const assignee = users.get(req.body.assignedUserId);
        if (!assignee || assignee.role !== 'practitioner' || assignee.status !== 'active') {
          throw new AppError('Appointments may only be assigned to an active practitioner.', 400);
        }
      }
      const appointment = appointments.create({
        ...req.body,
        createdBy: req.user.id,
        requestedBy: req.user.role === 'practitioner' ? req.user.id : req.body.requestedBy || req.user.id,
      });
      log(req, 'appointment_create', `appointment:${appointment.id}`, `scheduled ${appointment.examination}.`);
      res.status(201).json({ appointment });
    }),
  );

  router.post(
    '/appointments/:id/status',
    handleRoute((req, res) => {
      if (req.user.role !== 'administrator') {
        return res.status(403).json({ error: 'Only administrators can change appointment status.' });
      }
      const appointment = appointments.setStatus(req.params.id, req.body?.status, req.user.id);
      log(req, 'appointment_status', `appointment:${appointment.id}`, `set appointment status to ${appointment.status}.`);
      res.json({ appointment });
    }),
  );

  router.get(
    '/requests',
    handleRoute((req, res) => {
      const filters = {
        status: req.query.status,
        patientId: req.query.patientId,
      };
      if (req.user.role === 'practitioner') {
        filters.requestedBy = req.user.id;
      }
      if (req.user.role === 'radiologist' && req.query.mine === 'true') {
        filters.assignedRadiologistId = req.user.id;
        filters.assignedRadiologistOnly = true;
      } else if (req.user.role === 'radiologist') {
        filters.assignedRadiologistId = req.user.id;
      }
      let result = requests.list(filters);
      if (req.user.role === 'radiologist' && req.query.mine !== 'true') {
        result = result.filter((request) =>
          Number(request.assignedRadiologistId) === Number(req.user.id) ||
          ['submitted', 'scheduled'].includes(request.status),
        );
      }
      res.json({ requests: result });
    }),
  );

  router.post(
    '/requests',
    handleRoute((req, res) => {
      if (req.user.role !== 'practitioner' && req.user.role !== 'administrator') {
        return res.status(403).json({ error: 'You do not have permission to submit imaging requests.' });
      }
      if (req.user.role === 'practitioner') {
        requirePractitionerPatientAccess(req, req.body?.patientId);
      }
      const request = requests.create({ ...req.body, requestedBy: req.user.id });
      log(req, 'imaging_request_create', `request:${request.id}`, `submitted imaging request ${request.examination}.`);
      res.status(201).json({ request });
    }),
  );

  router.post(
    '/requests/:id/assign',
    handleRoute((req, res) => {
      if (req.user.role !== 'radiologist') {
        return res.status(403).json({ error: 'Only radiologists can claim examinations.' });
      }
      const request = requests.assign(req.params.id, req.user.id);
      log(req, 'imaging_request_assign', `request:${request.id}`, 'claimed an imaging request.');
      res.json({ request });
    }),
  );

  router.get(
    '/reports',
    handleRoute((req, res) => {
      if (req.user.role === 'administrator') {
        throw new AppError('Radiology reports are not available to administrators.', 403);
      }
      const filters = { patientId: req.query.patientId, status: req.query.status };
      if (req.user.role === 'practitioner') {
        filters.status = 'approved';
      }
      if (req.user.role === 'radiologist' && req.query.mine === 'true') {
        filters.radiologistId = req.user.id;
      }
      let result = reports.list(filters);
      if (req.user.role === 'radiologist') {
        result = result.filter((report) =>
          Number(report.radiologistId) === Number(req.user.id) &&
          report.imagingStudyId &&
          studies.isInternalStudyAssignedToRadiologist(report.imagingStudyId, req.user.id),
        );
      } else if (req.user.role === 'practitioner') {
        result = result.filter((report) => {
          if (!report.imagingStudyId) return false;
          const study = studies.get(report.imagingStudyId);
          return study && studies.isAssignedToPractitioner(study.orthancStudyId, req.user.id);
        });
      }
      res.json({ reports: result });
    }),
  );

  router.post(
    '/reports',
    handleRoute((req, res) => {
      if (req.user.role !== 'radiologist') {
        return res.status(403).json({ error: 'Only radiologists can prepare reports.' });
      }
      const imagingStudy = studies.get(req.body?.imagingStudyId);
      if (
        !imagingStudy ||
        Number(imagingStudy.imagingRequestId) !== Number(req.body?.imagingRequestId) ||
        !studies.isInternalStudyAssignedToRadiologist(imagingStudy.id, req.user.id)
      ) {
        throw new AppError('Reports can only be saved for a study linked to your assigned imaging request.', 403);
      }
      if (req.body?.id) {
        const existingReport = reports.get(req.body.id);
        if (
          !existingReport ||
          Number(existingReport.imagingStudyId) !== Number(imagingStudy.id) ||
          Number(existingReport.imagingRequestId) !== Number(imagingStudy.imagingRequestId)
        ) {
          throw new AppError('A report draft cannot be moved to a different study or imaging request.', 409);
        }
      }
      const report = reports.saveDraft({
        ...req.body,
        patientId: imagingStudy.patientId,
        imagingStudyId: imagingStudy.id,
        imagingRequestId: imagingStudy.imagingRequestId,
        radiologistId: req.user.id,
      });
      log(req, 'report_draft', `report:${report.id}`, 'saved a radiology report draft.');
      res.json({ report });
    }),
  );

  router.post(
    '/reports/:id/approve',
    handleRoute((req, res) => {
      if (req.user.role !== 'radiologist') {
        return res.status(403).json({ error: 'Only radiologists can approve reports.' });
      }
      const existingReport = reports.get(req.params.id);
      if (
        !existingReport ||
        !existingReport.imagingStudyId ||
        !studies.isInternalStudyAssignedToRadiologist(existingReport.imagingStudyId, req.user.id)
      ) {
        throw new AppError('You may only approve reports for studies assigned to you.', 403);
      }
      const report = reports.approve(req.params.id, req.user.id);
      log(req, 'report_approve', `report:${report.id}`, `approved report for ${report.mrn}.`);
      res.json({ report });
    }),
  );

  router.get(
    '/notifications',
    handleRoute((req, res) => {
      res.json({
        notifications: notifications.listForUser(req.user.id, { unreadOnly: req.query.unread === 'true' }),
        unread: notifications.unreadCount(req.user.id),
      });
    }),
  );

  router.post(
    '/notifications/:id/read',
    handleRoute((req, res) => {
      const notification = notifications.markRead(req.params.id, req.user.id);
      if (!notification) {
        throw new AppError('Notification not found.', 404);
      }
      res.json({ notification });
    }),
  );

  router.post(
    '/notifications/read-all',
    handleRoute((req, res) => {
      notifications.markAllRead(req.user.id);
      res.json({ ok: true });
    }),
  );

  router.get(
    '/staff',
    handleRoute((_req, res) => {
      res.json({
        radiologists: users.list().filter((user) => user.role === 'radiologist' && user.status === 'active'),
        practitioners: users.list().filter((user) => user.role === 'practitioner' && user.status === 'active'),
      });
    }),
  );

  return router;
}
