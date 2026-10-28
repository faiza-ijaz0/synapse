/**
 * Returns a connection URL safe for logs: the password is replaced and query
 * parameters are dropped (they can carry credentials, e.g. `sslpassword`).
 */
export function redactConnectionUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.password !== '') url.password = '*****';
    url.search = '';
    return url.toString();
  } catch {
    return '[unparseable url]';
  }
}

/** Returns the database name from a PostgreSQL connection URL. */
export function databaseNameFromUrl(value: string): string {
  const url = new URL(value);
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}
