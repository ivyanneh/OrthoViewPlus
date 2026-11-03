import { Router } from 'express';

export function createHealthRouter({ orthanc, aiClient }) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const orthancHealth = await orthanc.getHealth();
    const aiHealth = aiClient ? await aiClient.health() : { available: false };
    res.json({
      application: 'OrthoView+',
      status: 'ok',
      orthanc: orthancHealth,
      ai: aiHealth,
    });
  });

  return router;
}
