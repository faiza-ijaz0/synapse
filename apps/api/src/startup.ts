/**
 * One-line, stack-free messages for the listen errors a user can fix
 * themselves. Returns undefined for anything else, which stays fatal as is.
 */
export function describeListenError(
  error: unknown,
  host: string,
  port: number,
): string | undefined {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'EADDRINUSE':
      return `Cannot listen on ${host}:${port}: the port is already in use by another process. Set SYNAPSE_API_PORT to a free port (docs/09 §7).`;
    case 'EACCES':
      return `Cannot listen on ${host}:${port}: permission denied. Choose another SYNAPSE_API_PORT (docs/09 §7).`;
    default:
      return undefined;
  }
}
