import { Router } from 'express';
import { AppError, handleRoute } from '../utils/http.js';

export function createExposureRouter({ orthanc, audit, studies, patientMappings }) {
  const router = Router();

  router.get('/', handleRoute(async (req, res) => {
    if (!['practitioner', 'radiologist'].includes(req.user?.role)) {
      throw new AppError('Exposure information is available only to practitioners and radiologists.', 403);
    }

    audit.log({
      userId: req.user?.id ?? null,
      action: 'view_exposure_index',
      target: 'exposure_index',
      description: `User "${req.user?.username ?? 'unknown'}" loaded the exposure index module.`,
    });

    const orthancStatus = await orthanc.getOrthancStatus();
    if (!orthancStatus.connected) {
      return res.status(503).json({ orthanc: orthancStatus, rows: [], error: 'Orthanc unavailable' });
    }

    const rows = await orthanc.getExposureIndexRows({ limit: req.query.limit });
    const visibleRows = rows.filter((row) => {
      if (!row.orthancStudyId || !row.patientId) return false;
      const internalStudy = studies.getByOrthancStudyId(row.orthancStudyId);
      const mapping = patientMappings.getVerifiedMapping(row.patientId);
      if (!internalStudy || !mapping || Number(mapping.patientId) !== Number(internalStudy.patientId)) return false;
      return req.user.role === 'radiologist'
        ? studies.isAssignedToRadiologist(row.orthancStudyId, req.user.id)
        : studies.isAssignedToPractitioner(row.orthancStudyId, req.user.id);
    }).map(({ orthancStudyId: _orthancStudyId, ...row }) => row);

    res.json({ orthanc: orthancStatus, rows: visibleRows });
  }));

  return router;
}
