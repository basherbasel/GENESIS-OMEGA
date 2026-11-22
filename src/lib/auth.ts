import crypto from 'node:crypto';

/**
 * Optional single-user session guard for the HTTP API.
 *
 * The raw API key is never sent back to the browser: login exchanges it for a
 * random in-memory session token stored in an HttpOnly, SameSite=Strict cookie.
 * Comparisons are constant-time to avoid timing oracles.
 */

export const SESSION_COOKIE_NAME = 'omega_session';
export const SESSION_MAX_AGE_SEC = 86_400;

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(a || '', 'utf8');
  const right = Buffer.from(b || '', 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function newSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Parse one cookie value without trusting the rest of the header. */
export function parseCookieHeader(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function buildSessionCookie(
  token: string,
  options: { secure?: boolean; maxAgeSec?: number } = {},
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(60, Math.floor(options.maxAgeSec ?? SESSION_MAX_AGE_SEC))}`,
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

/** Minimal per-client failure throttle for the login endpoint. */
export function createLoginThrottle(windowMs = 60_000, maxAttempts = 8) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    isBlocked(key: string): boolean {
      const entry = hits.get(key);
      if (!entry) return false;
      if (Date.now() >= entry.resetAt) {
        hits.delete(key);
        return false;
      }
      return entry.count >= maxAttempts;
    },
    recordFailure(key: string): void {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || now >= entry.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
      } else {
        entry.count += 1;
      }
    },
    clear(key: string): void {
      hits.delete(key);
    },
  };
}
