import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from './rate_limit';

test('allows up to the configured number of requests then blocks with 429 semantics', () => {
  const limiter = new RateLimiter(2, 60_000);
  assert.deepEqual(limiter.check('client-a', 1000), { allowed: true, remaining: 1, retryAfterSec: 0 });
  assert.deepEqual(limiter.check('client-a', 1001), { allowed: true, remaining: 0, retryAfterSec: 0 });
  const blocked = limiter.check('client-a', 1002);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSec >= 1);
});

test('windows reset and client keys are independent', () => {
  const limiter = new RateLimiter(1, 1000);
  assert.equal(limiter.check('a', 0).allowed, true);
  assert.equal(limiter.check('a', 10).allowed, false);
  assert.equal(limiter.check('b', 10).allowed, true);
  assert.equal(limiter.check('a', 1001).allowed, true);
  limiter.reset('a');
  assert.equal(limiter.check('a', 1002).allowed, true);
  assert.ok(limiter.activeBuckets >= 1);
});

test('constructor rejects invalid limits', () => {
  assert.throws(() => new RateLimiter(0, 1000));
  assert.throws(() => new RateLimiter(1, 0));
});
