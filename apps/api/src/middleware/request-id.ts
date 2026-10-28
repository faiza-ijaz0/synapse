import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express's documented augmentation point
  namespace Express {
    interface Request {
      /** Server-generated correlation ID (also pino-http's `req.id`). */
      requestId: string;
    }
  }
}

/**
 * Assigns every request a server-generated ID, echoed in `X-Request-Id`.
 * Client-supplied IDs are ignored so log correlation can't be spoofed.
 */
export const requestId: RequestHandler = (req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
