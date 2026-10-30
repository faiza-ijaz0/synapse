import { inspect } from 'node:util';

const REDACTED = '[REDACTED]';

/**
 * Holds key material so that it can't be logged, serialized, or interpolated
 * by accident: every string form is `[REDACTED]`. Trusted consumers (HMAC,
 * encryption) read the key with `bytes()`.
 */
export class SecretValue {
  readonly #bytes: Buffer;

  constructor(bytes: Uint8Array) {
    // Copy, so the caller can't change the key after handing it over.
    this.#bytes = Buffer.from(bytes);
  }

  /** A copy of the key. Mutating it doesn't affect the stored value. */
  bytes(): Buffer {
    return Buffer.from(this.#bytes);
  }

  get byteLength(): number {
    return this.#bytes.length;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}
