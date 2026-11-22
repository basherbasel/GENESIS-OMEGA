import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSecureBinding, InsecureBindingError, isLoopbackHost } from './binding_guard';

test('loopback binds are allowed without a key', () => {
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('::1'), true);
  assert.doesNotThrow(() => assertSecureBinding('127.0.0.1', undefined));
  assert.doesNotThrow(() => assertSecureBinding('localhost', ''));
});

test('0.0.0.0 without OMEGA_API_KEY fails closed with INSECURE_BINDING', () => {
  assert.throws(
    () => assertSecureBinding('0.0.0.0', undefined),
    (err: unknown) => err instanceof InsecureBindingError && err.code === 'INSECURE_BINDING',
  );
  assert.throws(
    () => assertSecureBinding('0.0.0.0', '   '),
    (err: unknown) => err instanceof InsecureBindingError,
  );
});

test('a non-loopback bind with a key is accepted', () => {
  assert.doesNotThrow(() => assertSecureBinding('0.0.0.0', 'a-long-random-key'));
  assert.equal(isLoopbackHost('0.0.0.0'), false);
});
