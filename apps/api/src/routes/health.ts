import type { LivenessResponse, ReadinessResponse } from '@synapse/contracts';
import { Router } from 'express';

export type ReadinessProbe = () => Promise<ReadinessResponse['checks']>;

export function healthRouter(readiness: ReadinessProbe): Router {
  const router = Router();

  // The process is up and serving HTTP. Never touches dependencies.
  router.get('/live', (_req, res) => {
    const body: LivenessResponse = { status: 'ok' };
    res.json(body);
  });

  // Dependencies are usable. 503 when any check is down.
  router.get('/ready', async (_req, res) => {
    const checks = await readiness();
    const ready = Object.values(checks).every((check) => check.status === 'up');
    const body: ReadinessResponse = { status: ready ? 'ready' : 'not_ready', checks };
    res.status(ready ? 200 : 503).json(body);
  });

  return router;
}
