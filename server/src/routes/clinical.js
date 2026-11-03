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

  router.get(
    '/patients',
    handleRoute((req, res) => {
      res.json({ patients: patients.search({ query: req.query.q, status: req.query.status || 'active' }) });
    }),
  );

  router.post(
    '/patients',
    handleRoute((req, res) => {
      if (!['administrator', 'practitioner'].includes(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to register patients.' });
      }
      const patient = patients.create({ ...req.body, createdBy: req.user.id });
      log(req, 'patient_create', `patient:${patient.id}`, `registered patient ${patient.mrn}.`);
      res.status(201).json({ patient });
    }),
  );

  router.get(
    '/patients/:id',
    handleRoute((req, res) => {
      const patient = patients.requirePatient(req.params.id);
      let authorizedRequest = null;
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
      res.json({
        appointments: appointments.list({
          status: req.query.status,
          dateFrom: req.query.dateFrom,
          dateTo: req.query.dateTo,
          patientId: req.query.patientId,
        }),
        counts: appointments.counts(),
      });
    }),
  );

  router.post(
    '/appointments',
    handleRoute((req, res) => {
      if (req.user.role !== 'administrator' && req.user.role !== 'practitioner') {
        return res.status(403).json({ error: 'You do not have permission to schedule appointments.' });
      }
      const appointment = appointments.create({
        ...req.body,
        createdBy: req.user.id,
        requestedBy: req.body.requestedBy || req.user.id,
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
      res.json({ requests: requests.list(filters) });
    }),
  );

  router.post(
    '/requests',
    handleRoute((req, res) => {
      if (req.user.role !== 'practitioner' && req.user.role !== 'administrator') {
        return res.status(403).json({ error: 'You do not have permission to submit imaging requests.' });
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
      res.json({ notification: notifications.markRead(req.params.id, req.user.id) });
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
