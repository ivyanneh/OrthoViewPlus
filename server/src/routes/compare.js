import { Router } from 'express';
import { AppError, handleRoute } from '../utils/http.js';

export function createCompareRouter({ orthanc, audit, studies, patientMappings }) {
  const router = Router();

  function log(req, action, target, description) {
    audit.log({
      userId: req.user?.id ?? null,
      action,
      target,
      description: `User "${req.user?.username ?? 'unknown'}" ${description}`,
    });
  }

  function assertRole(req) {
    if (!['practitioner', 'radiologist'].includes(req.user?.role)) {
      throw new AppError('Study comparison is available only to practitioners and radiologists.', 403);
    }
  }

  function hasStudyAccess(req, study) {
    if (req.user.role === 'radiologist') {
      return studies.isAssignedToRadiologist(study.orthancStudyId, req.user.id);
    }
    return studies.isAssignedToPractitioner(study.orthancStudyId, req.user.id);
  }

  function assertVerifiedLink(req, internalStudy, profile) {
    if (!internalStudy || !profile?.patientId) {
      throw new AppError('Both studies must have an application link and DICOM PatientID.', 403);
    }
    const mapping = patientMappings.getVerifiedMapping(profile.patientId);
    if (!mapping || Number(mapping.patientId) !== Number(internalStudy.patientId)) {
      throw new AppError('Both studies must have verified DICOM patient mappings.', 403);
    }
    if (!hasStudyAccess(req, internalStudy)) {
      throw new AppError('You may only compare studies from your permitted requests.', 403);
    }
    return mapping;
  }

  router.get('/studies', handleRoute(async (req, res) => {
    assertRole(req);
    const orthancStatus = await orthanc.getOrthancStatus();
    if (!orthancStatus.connected) {
      return res.status(503).json({ orthanc: orthancStatus, studies: [], error: 'Orthanc unavailable' });
    }

    const listed = await orthanc.listStudies({ limit: req.query.limit });
    const visible = [];
    for (const candidate of listed) {
      const internalStudy = studies.getByOrthancStudyId(candidate.id);
      if (!internalStudy) continue;
      const profile = candidate.patientId
        ? candidate
        : await orthanc.getStudyProfile(candidate.id);
      if (!profile.patientId) continue;
      const mapping = patientMappings.getVerifiedMapping(profile.patientId);
      if (
        !mapping ||
        Number(mapping.patientId) !== Number(internalStudy.patientId) ||
        !hasStudyAccess(req, internalStudy)
      ) {
        continue;
      }
      visible.push({
        ...candidate,
        patientRecordId: internalStudy.patientId,
        patientMrn: internalStudy.mrn,
        imagingRequestId: internalStudy.imagingRequestId,
      });
    }

    log(req, 'view_compare_scans', 'compare_scans', 'opened the scan comparison module.');
    res.json({ orthanc: orthancStatus, studies: visible });
  }));

  router.get('/compare', handleRoute(async (req, res) => {
    assertRole(req);
    const leftStudyId = String(req.query.leftStudyId || '').trim();
    const rightStudyId = String(req.query.rightStudyId || '').trim();
    if (!leftStudyId || !rightStudyId || leftStudyId === rightStudyId) {
      throw new AppError('Two different study identifiers are required.', 400);
    }

    const orthancStatus = await orthanc.getOrthancStatus();
    if (!orthancStatus.connected) {
      return res.status(503).json({ orthanc: orthancStatus, comparison: null, error: 'Orthanc unavailable' });
    }

    const [leftInternal, rightInternal, leftProfile, rightProfile] = await Promise.all([
      Promise.resolve(studies.getByOrthancStudyId(leftStudyId)),
      Promise.resolve(studies.getByOrthancStudyId(rightStudyId)),
      orthanc.getStudyProfile(leftStudyId),
      orthanc.getStudyProfile(rightStudyId),
    ]);
    const leftMapping = assertVerifiedLink(req, leftInternal, leftProfile);
    const rightMapping = assertVerifiedLink(req, rightInternal, rightProfile);
    if (
      Number(leftInternal.patientId) !== Number(rightInternal.patientId) ||
      Number(leftMapping.patientId) !== Number(rightMapping.patientId)
    ) {
      throw new AppError('Studies may only be compared when both map to the same verified patient.', 409);
    }

    log(req, 'compare_scans', 'compare_scans', `compared authorized studies ${leftStudyId} and ${rightStudyId}.`);
    res.json({ orthanc: orthancStatus, comparison: { left: leftProfile, right: rightProfile } });
  }));

  return router;
}
