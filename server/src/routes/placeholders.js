import { Router } from 'express';

function notImplemented(resource) {
  return (_req, res) => {
    res.status(501).json({
      error: `${resource} is not implemented yet.`,
      detail: 'This endpoint will query Orthanc when imaging retrieval is added in a later milestone.',
    });
  };
}

export function createPlaceholderRouter(resource) {
  const router = Router();
  router.get('/', notImplemented(resource));
  return router;
}
