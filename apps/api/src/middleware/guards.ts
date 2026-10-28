import type { RequestHandler } from 'express';
import { HttpError } from '../http-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rejects requests whose Host header isn't one of ours. Defeats DNS
 * rebinding: a hostile page can point its own hostname at 127.0.0.1, but the
 * browser still sends that hostname in Host (threat model T1).
 */
export function hostGuard(allowedHosts: ReadonlySet<string>): RequestHandler {
  return (req, _res, next) => {
    const host = req.headers.host?.toLowerCase();
    if (host === undefined || !allowedHosts.has(host)) {
      next(new HttpError(403, 'HOST_NOT_ALLOWED', 'Host header not allowed'));
      return;
    }
    next();
  };
}

/**
 * Rejects state-changing requests that carry a foreign Origin (CSRF from
 * other sites). Requests without Origin (the CLI) pass and are
 * authenticated separately.
 */
export function originGuard(allowedOrigins: ReadonlySet<string>): RequestHandler {
  return (req, _res, next) => {
    const origin = req.headers.origin;
    if (!SAFE_METHODS.has(req.method) && origin !== undefined && !allowedOrigins.has(origin)) {
      next(new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Origin not allowed'));
      return;
    }
    next();
  };
}

/** Host header values the API answers to: loopback on its port, plus the web UI's host. */
export function buildAllowedHosts(port: number, webOrigin: string): Set<string> {
  return new Set(
    [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, new URL(webOrigin).host].map((h) =>
      h.toLowerCase(),
    ),
  );
}
