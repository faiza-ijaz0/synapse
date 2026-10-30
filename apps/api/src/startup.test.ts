import { describe, expect, it } from 'vitest';
import { describeListenError } from './startup.js';

describe('describeListenError', () => {
  it('explains a port that is already in use', () => {
    expect(describeListenError({ code: 'EADDRINUSE' }, '127.0.0.1', 4100)).toBe(
      'Cannot listen on 127.0.0.1:4100: the port is already in use by another process. ' +
        'Set SYNAPSE_API_PORT to a free port (docs/09 §7).',
    );
  });

  it('explains a port the process may not bind', () => {
    expect(describeListenError({ code: 'EACCES' }, '127.0.0.1', 80)).toBe(
      'Cannot listen on 127.0.0.1:80: permission denied. Choose another SYNAPSE_API_PORT (docs/09 §7).',
    );
  });

  it.each([new Error('boom'), { code: 'ECONNRESET' }, null, 'EADDRINUSE'])(
    'leaves other errors fatal (%s)',
    (error) => {
      expect(describeListenError(error, '127.0.0.1', 4100)).toBeUndefined();
    },
  );
});
