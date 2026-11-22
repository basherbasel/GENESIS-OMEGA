import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, bridgeState, LlamaBridgeError, LLAMA_DEFAULT_TIMEOUT_MS } from './llama-bridge';

function codeOf(err: unknown): string | undefined {
  return err instanceof LlamaBridgeError ? err.code : undefined;
}

/** A fetch that never resolves until its signal aborts. */
function pendingFetch(): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new Error('aborted'));
        return;
      }
      signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })) as typeof fetch;
}

test('single-flight mutex: a concurrent second caller waits for the first', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const gate: { release: (() => void) | null } = { release: null };

  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) await new Promise<void>((resolve) => { gate.release = resolve; });
    return new Response(JSON.stringify({ response: `result-${calls}` }), { status: 200 });
  }) as typeof fetch;

  try {
    const first = generate({ model: 'model-a', prompt: 'first', timeoutMs: 5000 });
    const second = generate({ model: 'model-b', prompt: 'second', timeoutMs: 5000 });

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(calls, 1, 'second generation started before the first finished');
    assert.deepEqual(bridgeState(), { active: true, waiting: 1 });

    if (!gate.release) throw new Error('first fetch never reached the gate');
    gate.release();

    const [r1, r2] = await Promise.all([first, second]);
    assert.equal(calls, 2);
    assert.equal(r1.text, 'result-1');
    assert.equal(r2.text, 'result-2');
    assert.deepEqual(bridgeState(), { active: false, waiting: 0 });
  } finally {
    globalThis.fetch = original;
  }
});

test('timeout: a 100ms deadline on a stalled request throws TIMEOUT', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = pendingFetch();
  try {
    assert.equal(LLAMA_DEFAULT_TIMEOUT_MS, 60_000);
    await assert.rejects(
      generate({ model: 'stalled', prompt: 'x'.repeat(200), timeoutMs: 100 }),
      (err: unknown) => codeOf(err) === 'TIMEOUT',
    );
    assert.deepEqual(bridgeState(), { active: false, waiting: 0 });
  } finally {
    globalThis.fetch = original;
  }
});

test('fail-closed: a missing model throws MODEL_NOT_FOUND (no silent fallback)', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "model 'ghost' not found, try pulling it first" }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
  try {
    await assert.rejects(
      generate({ model: 'ghost', prompt: 'hello', timeoutMs: 2000 }),
      (err: unknown) => codeOf(err) === 'MODEL_NOT_FOUND',
    );
    assert.deepEqual(bridgeState(), { active: false, waiting: 0 });
  } finally {
    globalThis.fetch = original;
  }
});

test('abort: an external AbortController throws ABORTED', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = pendingFetch();
  const controller = new AbortController();
  try {
    const running = generate({ model: 'abortable', prompt: 'hello', signal: controller.signal, timeoutMs: 5000 });
    setTimeout(() => controller.abort(), 25);
    await assert.rejects(running, (err: unknown) => codeOf(err) === 'ABORTED');
    assert.deepEqual(bridgeState(), { active: false, waiting: 0 });
  } finally {
    globalThis.fetch = original;
  }
});
