import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSessionCookie,
  createLoginThrottle,
  newSessionToken,
  parseCookieHeader,
  SESSION_COOKIE_NAME,
  timingSafeEqualStrings,
} from './auth';

test('session comparisons are constant-time and length-safe', () => {
  assert.equal(timingSafeEqualStrings('secret-key', 'secret-key'), true);
  assert.equal(timingSafeEqualStrings('secret-key', 'secret-key!'), false);
  assert.equal(timingSafeEqualStrings('secret-key', 'other-key-'), false);
  assert.match(newSessionToken(), /^[0-9a-f]{64}$/);
});

test('cookie parser extracts only the session cookie and tolerates malformed values', () => {
  const header = `theme=dark; ${SESSION_COOKIE_NAME}=abc%20123; token=unrelated`;
  assert.equal(parseCookieHeader(header, SESSION_COOKIE_NAME), 'abc 123');
  assert.equal(parseCookieHeader(header, 'missing'), null);
  assert.equal(parseCookieHeader(`${SESSION_COOKIE_NAME}=%ZZ`, SESSION_COOKIE_NAME), null);
  assert.equal(parseCookieHeader(undefined, SESSION_COOKIE_NAME), null);
});

test('session cookie is HttpOnly, SameSite=Strict and optionally Secure', () => {
  const normal = buildSessionCookie('token');
  assert.match(normal, /^omega_session=token;/);
  assert.match(normal, /HttpOnly/);
  assert.match(normal, /SameSite=Strict/);
  assert.match(normal, /Max-Age=86400/);
  assert.doesNotMatch(normal, /Secure/);
  const secure = buildSessionCookie('token', { secure: true, maxAgeSec: 120 });
  assert.match(secure, /Secure/);
  assert.match(secure, /Max-Age=120/);
});

test('login throttle blocks repeated failures and recovers after its window', async () => {
  const throttle = createLoginThrottle(20, 2);
  assert.equal(throttle.isBlocked('127.0.0.1'), false);
  throttle.recordFailure('127.0.0.1');
  throttle.recordFailure('127.0.0.1');
  assert.equal(throttle.isBlocked('127.0.0.1'), true);
  throttle.clear('127.0.0.1');
  assert.equal(throttle.isBlocked('127.0.0.1'), false);
  throttle.recordFailure('127.0.0.1');
  throttle.recordFailure('127.0.0.1');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(throttle.isBlocked('127.0.0.1'), false);
});
