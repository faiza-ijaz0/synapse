import { describe, expect, it } from 'vitest';
import { ErrorEnvelope } from './index.js';

describe('ErrorEnvelope', () => {
  it('accepts a well-formed error body', () => {
    const body = {
      error: { code: 'NOT_FOUND', message: 'Route not found', requestId: 'abc' },
    };
    expect(ErrorEnvelope.parse(body)).toEqual(body);
  });

  it('rejects unknown error codes', () => {
    const result = ErrorEnvelope.safeParse({
      error: { code: 'TEAPOT', message: 'x', requestId: 'abc' },
    });
    expect(result.success).toBe(false);
  });
});
