import { Router } from 'express';
import { AppError, handleRoute } from '../utils/http.js';

export function createImagingRouter({ orthanc, studies, patients, patientMappings, requests, audit }) {
  const router = Router();

  function isAssigned(req, orthancStudyId) {
    if (req.user.role === 'radiologist') {
      return studies.isAssignedToRadiologist(orthancStudyId, req.user.id);
    }
    if (req.user.role === 'practitioner') {
      return studies.isAssignedToPractitioner(orthancStudyId, req.user.id);
    }
    return false;
  }

  async function assertStudyAccess(req, orthancStudyId) {
    if (req.user.role === 'administrator') return;
    const linkedStudy = studies.getByOrthancStudyId(orthancStudyId);
    if (!linkedStudy || !isAssigned(req, orthancStudyId)) {
      throw new AppError('You may only access studies assigned to you.', 403);
    }
    const profile = await orthanc.getStudyProfile(orthancStudyId);
    const mapping = profile.patientId ? patientMappings.getVerifiedMapping(profile.patientId) : null;
    if (!mapping || Number(mapping.patientId) !== Number(linkedStudy.patientId)) {
      throw new AppError('Study access requires a verified DICOM patient mapping.', 403);
    }
  }

  async function assertInstanceAccess(req, instanceId) {
    const resolved = await orthanc.getInstanceStudy(instanceId);
    await assertStudyAccess(req, resolved.orthancStudyId);
  }

  function log(req, action, target, description) {
    audit.log({
      userId: req.user?.id ?? null,
      action,
      target,
      description: `User "${req.user?.username ?? 'unknown'}" ${description}`,
    });
  }

  router.get(
    ['/studies', '/studies/'],
    handleRoute(async (req, res) => {
      const allStudies = await orthanc.listStudies({ limit: Number(req.query.limit) || 80 });
      const list = [];
      for (const study of allStudies) {
        const linkedStudy = studies.getByOrthancStudyId(study.id);
        const request = studies.getLinkedRequestForOrthancStudy(study.id);
        if (req.user.role !== 'administrator') {
        if (!linkedStudy || !study.patientId) continue;
        const mapping = patientMappings.getVerifiedMapping(study.patientId);
        if (
          !mapping ||
          Number(mapping.patientId) !== Number(linkedStudy.patientId) ||
          !isAssigned(req, study.id)
        ) {
          continue;
        }
        }
        list.push({
        ...study,
        sourceStudyId: linkedStudy?.id ?? null,
        imagingRequestId: linkedStudy?.imagingRequestId ?? null,
        patientRecordId: linkedStudy?.patientId ?? null,
        patientMrn: linkedStudy?.mrn ?? null,
        studyStatus: request?.status ?? null,
        });
      }
      log(req, 'view_studies', 'orthanc', 'listed imaging studies.');
      res.json({
        studies: list,
        pagination: { limit: Math.min(Math.max(Number(req.query.limit) || 80, 1), 200), hasMore: list.length === Math.min(Math.max(Number(req.query.limit) || 80, 1), 200) },
        orthanc: await orthanc.getHealth(),
      });
    }),
  );

  router.post(
    '/studies/:id/link',
    handleRoute(async (req, res) => {
      if (req.user.role !== 'administrator') {
        throw new AppError('Only administrators can link an Orthanc study to an imaging request.', 403);
      }
      const requestId = Number(req.body?.requestId);
      if (!Number.isSafeInteger(requestId) || requestId <= 0) {
        throw new AppError('A valid imaging request ID is required.', 400);
      }
      const request = requests.get(requestId);
      if (!request || request.status === 'cancelled') {
        throw new AppError('Imaging request not found or cancelled.', 404);
      }
      const profile = await orthanc.getStudyProfile(req.params.id);
      if (!profile.patientId) {
        throw new AppError('Orthanc study does not contain a DICOM PatientID.', 409);
      }
      const mapping = patientMappings.getVerifiedMapping(profile.patientId);
      if (!mapping) {
        throw new AppError('Verify the DICOM PatientID mapping before linking a study.', 409);
      }
      if (Number(mapping.patientId) !== Number(request.patientId)) {
        throw new AppError('The imaging request patient does not match the verified DICOM patient mapping.', 409);
      }
      const linkedStudy = studies.linkOrthancStudy({
        patientId: mapping.patientId,
        imagingRequestId: request.id,
        orthancStudyId: req.params.id,
        studyInstanceUid: profile.studyInstanceUID,
        studyDate: profile.studyDate,
        modality: profile.primarySeries?.modality ?? profile.modalitiesInStudy,
        description: profile.studyDescription,
      });
      log(req, 'orthanc_study_link', `imaging_study:${linkedStudy.id}`, `linked an Orthanc study to imaging request ${request.id}.`);
      res.json({ study: linkedStudy });
    }),
  );

  router.get(
    '/studies/:id',
    handleRoute(async (req, res) => {
      await assertStudyAccess(req, req.params.id);
      const profile = await orthanc.getStudyProfile(req.params.id);
      const series = await orthanc.listSeriesForStudy(req.params.id);
      const linkedStudyRecord = studies.getByOrthancStudyId(req.params.id);
      
      let linkedPatient = null;
      let verificationStatus = null;
      let linkedStudyId = null;
      
      if (profile.patientId) {
        const verifiedMapping = patientMappings.getVerifiedMapping(profile.patientId);
        if (verifiedMapping) {
          linkedPatient = {
            id: verifiedMapping.patientId,
            mrn: verifiedMapping.mrn,
            firstName: verifiedMapping.firstName,
            lastName: verifiedMapping.lastName,
          };
          verificationStatus = 'verified';
        } else {
          verificationStatus = 'unverified';
        }
      }
      
      if (linkedStudyRecord && linkedPatient && verificationStatus === 'verified') {
        if (Number(linkedStudyRecord.patientId) !== Number(linkedPatient.id)) {
          throw new AppError('The verified DICOM mapping does not match the linked imaging study patient.', 409);
        }
        linkedStudyId = linkedStudyRecord.id;
      }
      
      log(req, 'view_study', `orthanc-study:${req.params.id}`, 'opened an imaging study.');
      res.json({ 
        study: profile, 
        series, 
        linkedPatient: linkedPatient || null,
        sourceStudyId: linkedStudyId ?? linkedStudyRecord?.id ?? null,
        imagingRequestId: linkedStudyRecord?.imagingRequestId ?? null,
        patientRecordId: linkedPatient?.id ?? linkedStudyRecord?.patientId ?? null,
        verificationStatus,
        warning: verificationStatus === 'unverified' ? 'Study has unverified patient mapping. Patient-specific AI processing is disabled until mapping is verified.' : null
      });
    }),
  );

  router.get(
    '/instances/:id/preview',
    handleRoute(async (req, res) => {
      await assertInstanceAccess(req, req.params.id);
      const preview = await orthanc.getInstancePreview(req.params.id);
      res.setHeader('Content-Type', preview.contentType);
      res.setHeader('Cache-Control', 'private, max-age=60');
      res.send(preview.buffer);
    }),
  );

  router.get(
    '/instances/:id/rendered',
    handleRoute(async (req, res) => {
      await assertInstanceAccess(req, req.params.id);
      const rendered = await orthanc.getInstanceRendered(req.params.id, {
        'window-center': req.query.windowCenter,
        'window-width': req.query.windowWidth,
      });
      res.setHeader('Content-Type', rendered.contentType);
      res.send(rendered.buffer);
    }),
  );

  router.get(
    '/instances/:id/tags',
    handleRoute(async (req, res) => {
      await assertInstanceAccess(req, req.params.id);
      const tags = await orthanc.getInstanceTags(req.params.id);
      res.json({ tags });
    }),
  );

  return router;
}
