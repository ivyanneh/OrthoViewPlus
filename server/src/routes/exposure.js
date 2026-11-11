import { Router } from 'express';
import { AppError, handleRoute } from '../utils/http.js';
import express from 'express';
export function createExposureRouter({ orthanc, audit, studies, patientMappings }) {
  const router = Router();
  router.get('/', handleRoute(async (req, res) => {
    if (!['practitioner', 'radiologist'].includes(req.user?.role)) {
      throw new AppError('Exposure information is available only to practitioners and radiologists.', 403);
    }
    audit.log({ userId: req.user?.id ?? null, action: 'view_exposure_index', target: 'exposure_index', description: `User "${req.user?.username ?? 'unknown'}" loaded the exposure index module.` });
    const orthancStatus = await orthanc.getOrthancStatus();
    if (!orthancStatus.connected) { return res.status(503).json({ orthanc: orthancStatus, rows: [], error: 'Orthanc unavailable' }); }
    const rows = await orthanc.getExposureIndexRows({ limit: req.query.limit });
    let visibleRows = [];
    for (const row of rows) {
      if (!row.orthancStudyId || !row.patientId) continue;
      const internalStudy = studies.getByOrthancStudyId(row.orthancStudyId);
      const mapping = patientMappings.getVerifiedMapping(row.patientId);
      if (!internalStudy || !mapping || Number(mapping.patientId) !== Number(internalStudy.patientId)) continue;
      if (req.user.role === 'radiologist') {
        if (studies.isAssignedToRadiologist(row.orthancStudyId, req.user.id)) { visibleRows.push(row); }
      } else {
        if (studies.isAssignedToPractitioner(row.orthancStudyId, req.user.id)) { visibleRows.push(row); }
      }
    }
    res.json({ orthanc: orthancStatus, rows: visibleRows });
  }));
  router.post('/synthetic-dicom', express.raw({ type: 'application/dicom', limit: '50mb' }), handleRoute(async (req, res) => {
    if (req.user?.role !== 'administrator') {
      throw new AppError('Synthetic DICOM ingestion is restricted to administrators.', 403);
    }
    const dicomData = req.body;
    if (!dicomData || dicomData.length === 0) { throw new AppError('DICOM data is required.', 400); }
    const maxSize = Number(process.env.ORTHANC_UPLOAD_MAX_SIZE) || 50 * 1024 * 1024; if (dicomData.length > maxSize) { throw new AppError('DICOM data exceeds size limit of ' + (maxSize / (1024 * 1024)) + 'MB', 400); }
    const patientIdFromQuery = req.query.patientId; const requestIdFromQuery = req.query.requestId; if (!patientIdFromQuery) { throw new AppError('patientId metadata is required alongside the DICOM binary upload.', 400); } if (!requestIdFromQuery) { throw new AppError('requestId metadata is required alongside the DICOM binary upload.', 400); }
    const patientRow = studies.getPatient(Number(patientIdFromQuery)); if (!patientRow) { throw new AppError('Patient not found.', 404); } if (patientRow.status !== 'active') { throw new AppError('Patient is not active.', 400); }
    let uploadResult; try { uploadResult = await orthanc.uploadInstances(dicomData, { userId: req.user.id, description: 'Synthetic demonstration data import' }); } catch (uploadError) { throw new AppError('Orthanc upload failed: ' + (uploadError.message || String(uploadError)), 502); }
    const internalStudy = studies.getByOrthancStudyId(uploadResult.orthancStudyId); if (!internalStudy) { throw new AppError('Failed to retrieve study from Orthanc after upload.', 500); }
    let studyId; try { studyId = studies.linkOrthancStudy({ requestId: internalStudy.request_id || uploadResult.requestId || undefined, modality: internalStudy.modality || uploadResult.modality || 'MR', studyInstanceUID: internalStudy.study_instance_uid || uploadResult.studyInstanceUID, orthancStudyId: uploadResult.orthancStudyId, patientId: uploadResult.patientId }); } catch (linkError) { throw new AppError('Failed to link study to patient: ' + (linkError.message || String(linkError)), 400); }
    await audit.log({ userId: req.user.id, action: 'import_synthetic_dicom', target: 'synthetic_dicom', description: 'Administrator imported synthetic DICOM study ' + uploadResult.orthancStudyId + ' for patient ' + uploadResult.patientId, metadata: { studyInstanceUID: uploadResult.studyInstanceUID, modality: uploadResult.modality, orthancStudyId: uploadResult.orthancStudyId } });
    res.json({ success: true, studyId, orthancStudyId: uploadResult.orthancStudyId, studyInstanceUID: uploadResult.studyInstanceUID, patientId: uploadResult.patientId, message: 'Synthetic DICOM uploaded and linked successfully' });
  }));
  return router;
}