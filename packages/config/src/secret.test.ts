import { randomBytes } from 'node:crypto';
import { format, inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { SecretValue } from './secret.js';

describe('SecretValue', () => {
  const key = randomBytes(32);
  const keyHex = key.toString('hex');
  const keyBase64 = key.toString('base64');

  function expectRedacted(text: string): void {
    expect(text).toContain('[REDACTED]');
    expect(text).not.toContain(keyHex);
    expect(text).not.toContain(keyBase64);
  }

  it('redacts every string form', () => {
    const secret = new SecretValue(key);
    expect(String(secret)).toBe('[REDACTED]');
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- deliberate: proves interpolation is redacted
    expect(`${secret}`).toBe('[REDACTED]');
    expect(secret.toJSON()).toBe('[REDACTED]');
    expect(inspect(secret)).toBe('[REDACTED]');
    expectRedacted(JSON.stringify({ nested: { secret } }));
    expectRedacted(inspect({ nested: { secret } }, { depth: 10, showHidden: true }));
    expectRedacted(format('%s %o %O %j', secret, secret, secret, secret));
  });

  it('exposes the key to trusted consumers', () => {
    const secret = new SecretValue(key);
    expect(secret.bytes().equals(key)).toBe(true);
    expect(secret.byteLength).toBe(32);
  });

  it('is unaffected by mutating the source buffer or a returned copy', () => {
    const source = Buffer.from(key);
    const secret = new SecretValue(source);
    source.fill(0);
    const copy = secret.bytes();
    copy.fill(0);
    expect(secret.bytes().equals(key)).toBe(true);
  });

  it('has no enumerable own properties that could leak the key', () => {
    expect(Object.keys(new SecretValue(key))).toEqual([]);
  });
});
