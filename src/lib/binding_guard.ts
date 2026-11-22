/**
 * Fail-closed guard for the HTTP bind address.
 *
 * Binding to a non-loopback interface without authentication exposes every
 * /api and /sandbox route. This module is imported at server startup so an
 * unsafe configuration fails before the listener is created.
 */

export class InsecureBindingError extends Error {
  readonly code = 'INSECURE_BINDING' as const;

  constructor(host: string) {
    super(
      `Refusing to bind "${host || 'all interfaces'}" without OMEGA_API_KEY. ` +
        'Use HOST=127.0.0.1 or configure OMEGA_API_KEY plus an authenticating proxy.',
    );
    this.name = 'InsecureBindingError';
  }
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function isLoopbackHost(host: string): boolean {
  const normalized = (host || '').trim().toLowerCase();
  return LOOPBACK_HOSTS.has(normalized) || normalized.startsWith('127.');
}

/** Throw INSECURE_BINDING when a public bind has no API key. */
export function assertSecureBinding(host: string, apiKey: string | undefined): void {
  if (isLoopbackHost(host)) return;
  if ((apiKey || '').trim().length > 0) return;
  throw new InsecureBindingError(host);
}
