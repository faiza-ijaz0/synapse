import type { ErrorEnvelope } from '@synapse/contracts';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../http-error.js';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'Route not found'));
};

/** body-parser errors carry a `type` and an HTTP status. */
function bodyParserError(error: unknown): HttpError | undefined {
  if (typeof error !== 'object' || error === null || !('type' in error)) return undefined;
  switch (error.type) {
    case 'entity.parse.failed':
      return new HttpError(400, 'MALFORMED_JSON', 'Request body is not valid JSON');
    case 'entity.too.large':
      return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    default:
      return undefined;
  }
}

/** Maps every error onto the envelope. Unknown errors become INTERNAL; details stay in logs. */
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  const known = error instanceof HttpError ? error : bodyParserError(error);
  const httpError = known ?? new HttpError(500, 'INTERNAL', 'Internal server error');
  if (known === undefined) {
    req.log.error({ err: error }, 'unhandled error');
  }
  const body: ErrorEnvelope = {
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(httpError.details === undefined ? {} : { details: httpError.details }),
      requestId: req.requestId,
    },
  };
  res.status(httpError.status).json(body);
};
