import type { ErrorCode, ErrorDetail } from '@synapse/contracts';

/** An error that maps directly onto the API error envelope. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
