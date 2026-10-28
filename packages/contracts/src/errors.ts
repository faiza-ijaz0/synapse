import { z } from 'zod';

/** Closed set of machine-readable error codes returned by the API. */
export const ErrorCode = z.enum([
  'VALIDATION_FAILED',
  'MALFORMED_JSON',
  'PAYLOAD_TOO_LARGE',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'HOST_NOT_ALLOWED',
  'ORIGIN_NOT_ALLOWED',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorDetail = z.object({
  path: z.string(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof ErrorDetail>;

/** Body of every non-2xx API response. */
export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.array(ErrorDetail).optional(),
    requestId: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
