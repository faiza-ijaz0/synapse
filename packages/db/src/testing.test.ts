import { describe, expect, it } from 'vitest';
import { assertTestDatabaseUrl, UnsafeTestDatabaseError } from './testing.js';

describe('assertTestDatabaseUrl', () => {
  it('accepts databases whose name ends in _test', () => {
    expect(() => {
      assertTestDatabaseUrl('postgresql://u:p@127.0.0.1:5432/synapse_test');
    }).not.toThrow();
  });

  it.each(['synapse', 'postgres', 'synapse_test_backup', 'test'])('refuses %s', (name) => {
    expect(() => {
      assertTestDatabaseUrl(`postgresql://u:p@127.0.0.1:5432/${name}`);
    }).toThrow(UnsafeTestDatabaseError);
  });

  it('does not include the password in the error', () => {
    try {
      assertTestDatabaseUrl('postgresql://u:hunter2@127.0.0.1:5432/synapse');
    } catch (error) {
      expect(String(error)).not.toContain('hunter2');
    }
  });
});
