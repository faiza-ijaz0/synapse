import type { Logger } from '@synapse/logger';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFound } from './middleware/errors.js';
import { hostGuard, originGuard } from './middleware/guards.js';
import { requestId } from './middleware/request-id.js';
import { healthRouter, type ReadinessProbe } from './routes/health.js';

export interface AppDependencies {
  logger: Logger;
  allowedHosts: ReadonlySet<string>;
  allowedOrigins: ReadonlySet<string>;
  readiness: ReadinessProbe;
}

export function createApp({
  logger,
  allowedHosts,
  allowedOrigins,
  readiness,
}: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId,
      customLogLevel: (_req, res, error) => {
        if (error !== undefined || res.statusCode >= 500) return 'error';
        return res.statusCode >= 400 ? 'warn' : 'info';
      },
    }),
  );
  app.use(hostGuard(allowedHosts));
  app.use(originGuard(allowedOrigins));
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  const v1 = express.Router();
  v1.use('/health', healthRouter(readiness));
  app.use('/api/v1', v1);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
