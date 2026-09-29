import { Router } from 'express';

export function createHealthRouter({ orthanc }) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const orthancHealth = await orthanc.getHealth();
    res.json({
      application: 'OrthoView+',
      status: 'ok',
      orthanc: orthancHealth,
    });
  });

  return router;
}
