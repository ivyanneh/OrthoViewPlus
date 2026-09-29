import { Router } from 'express';

export function createCompareRouter({ orthanc, audit }) {
  const router = Router();

  router.get('/studies', async (req, res, next) => {
    try {
      audit.log({
        userId: req.user?.id ?? null,
        action: 'view_compare_scans',
        target: 'compare_scans',
        description: `User "${req.user?.username ?? 'unknown'}" opened the scan comparison module.`,
      });

      const orthancStatus = await orthanc.getOrthancStatus();
      if (!orthancStatus.connected) {
        return res.status(503).json({
          orthanc: orthancStatus,
          studies: [],
          error: 'Orthanc unavailable',
        });
      }

      const studies = await orthanc.listStudies({ limit: req.query.limit });

      res.json({
        orthanc: orthancStatus,
        studies,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/compare', async (req, res, next) => {
    try {
      const leftStudyId = String(req.query.leftStudyId || '').trim();
      const rightStudyId = String(req.query.rightStudyId || '').trim();

      if (!leftStudyId || !rightStudyId) {
        return res.status(400).json({ error: 'Two study identifiers are required.' });
      }

      audit.log({
        userId: req.user?.id ?? null,
        action: 'compare_scans',
        target: 'compare_scans',
        description: `User "${req.user?.username ?? 'unknown'}" compared studies ${leftStudyId} and ${rightStudyId}.`,
      });

      const orthancStatus = await orthanc.getOrthancStatus();
      if (!orthancStatus.connected) {
        return res.status(503).json({
          orthanc: orthancStatus,
          comparison: null,
          error: 'Orthanc unavailable',
        });
      }

      const comparison = await orthanc.compareStudies(leftStudyId, rightStudyId);

      res.json({
        orthanc: orthancStatus,
        comparison,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}