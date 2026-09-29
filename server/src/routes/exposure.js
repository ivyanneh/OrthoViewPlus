import { Router } from 'express';

export function createExposureRouter({ orthanc, audit }) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      audit.log({
        userId: req.user?.id ?? null,
        action: 'view_exposure_index',
        target: 'exposure_index',
        description: `User "${req.user?.username ?? 'unknown'}" loaded the exposure index module.`,
      });

      const orthancStatus = await orthanc.getOrthancStatus();
      if (!orthancStatus.connected) {
        return res.status(503).json({
          orthanc: orthancStatus,
          rows: [],
          error: 'Orthanc unavailable',
        });
      }

      const rows = await orthanc.getExposureIndexRows({
        limit: req.query.limit,
      });

      res.json({
        orthanc: orthancStatus,
        rows,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}