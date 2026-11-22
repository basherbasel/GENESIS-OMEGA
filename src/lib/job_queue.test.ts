import test from 'node:test';
import assert from 'node:assert/strict';
import { JobQueue } from './job_queue';
import { studioEvents } from './event_bus';

function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('condition not met before timeout'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

test('jobs receive unique ids and transition queued → running → done serially', async () => {
  const queue = new JobQueue();
  const seen: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  queue.setHandler(async (payload: never) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const value = (payload as { value: number }).value;
    await new Promise((resolve) => setTimeout(resolve, 20));
    seen.push(`start-${value}`);
    inFlight -= 1;
    return value * 2;
  });

  const a = queue.enqueue<{ value: number }, number>('test', { value: 1 });
  const b = queue.enqueue<{ value: number }, number>('test', { value: 2 });
  const c = queue.enqueue<{ value: number }, number>('test', { value: 3 });

  assert.equal(new Set([a.id, b.id, c.id]).size, 3);
  assert.ok(['queued', 'running'].includes(a.status));
  assert.equal(b.status, 'queued');
  assert.equal(c.status, 'queued');

  await waitFor(() => [a, b, c].every((job) => job.status === 'done'));

  assert.deepEqual(seen, ['start-1', 'start-2', 'start-3'], 'jobs overlapped or ran out of order');
  assert.equal(maxInFlight, 1);
  assert.equal(a.result, 2);
  assert.equal(c.result, 6);
  assert.ok(a.startedAt && a.finishedAt);
  assert.equal(queue.activeCount, 0);
});

test('a failed job is recorded and does not stop later jobs', async () => {
  const queue = new JobQueue();
  queue.setHandler(async (payload: never) => {
    if ((payload as { fail: boolean }).fail) throw new Error('boom');
    return 'ok';
  });

  const bad = queue.enqueue<{ fail: boolean }, string>('test', { fail: true });
  const good = queue.enqueue<{ fail: boolean }, string>('test', { fail: false });

  await waitFor(() => bad.status === 'failed' && good.status === 'done');
  assert.equal(bad.error, 'boom');
  assert.equal(good.result, 'ok');
  assert.equal(good.error, undefined);
});

test('each status transition publishes a job event', async () => {
  const queue = new JobQueue();
  const statuses: string[] = [];
  const off = studioEvents.subscribe('job', (event) => {
    if ((event.payload as { type: string }).type === 'event-test') {
      statuses.push((event.payload as { status: string }).status);
    }
  });
  queue.setHandler(async () => 'ok');
  try {
    const job = queue.enqueue<string, string>('event-test', 'x');
    await waitFor(() => job.status === 'done');
    assert.deepEqual(statuses, ['queued', 'running', 'done']);
  } finally {
    off();
  }
});
