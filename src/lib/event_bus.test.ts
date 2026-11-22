import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSseFrame, studioEvents, type StudioEvent } from './event_bus';

test('subscribers receive only their topic and unsubscribe stops delivery', () => {
  const stateReceived: string[] = [];
  const heartbeatReceived: string[] = [];
  const offState = studioEvents.subscribe('state', (event) =>
    stateReceived.push(String((event.payload as { projects?: number }).projects)),
  );
  const offHeartbeat = studioEvents.subscribe('heartbeat', () => heartbeatReceived.push('hb'));

  studioEvents.publish('heartbeat', { ping: true });
  studioEvents.publish('state', { projects: 8 });

  assert.deepEqual(stateReceived, ['8']);
  assert.deepEqual(heartbeatReceived, ['hb']);
  offState();
  offHeartbeat();
  studioEvents.publish('state', { projects: 9 });
  assert.deepEqual(stateReceived, ['8'], 'unsubscribed listener still fired');
});

test('published events carry a timestamp and produce valid SSE frames', () => {
  const event = studioEvents.publish('state', { projects: 3 });
  assert.match(event.at, /^\d{4}-\d{2}-\d{2}T/);
  const frame = formatSseFrame(event as StudioEvent);
  assert.match(frame, /^event: state\ndata: \{/);
  assert.ok(frame.endsWith('\n\n'));
  assert.doesNotThrow(() => JSON.parse(frame.split('\ndata: ')[1].trim()));
});

test('an SSE stream delivers ready then state frames and closes cleanly', async () => {
  const holder: { off: (() => void) | null } = { off: null };
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(formatSseFrame(studioEvents.publish('ready', { status: 'connected' })));
    holder.off = studioEvents.subscribe('state', (event) => {
      try {
        res.write(formatSseFrame(event));
      } catch {
        // ignore closed stream
      }
    });
    req.on('close', () => holder.off?.());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/events`);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    assert.match(first, /event: ready/);
    studioEvents.publish('state', { projects: 7 });
    const second = decoder.decode((await reader.read()).value);
    assert.match(second, /event: state/);
    assert.match(second, /"projects":7/);
    await reader.cancel();
  } finally {
    holder.off?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('publish never throws when a listener fails', () => {
  const before = studioEvents.listenerCount('state');
  const off = studioEvents.subscribe('state', () => {
    throw new Error('listener failure');
  });
  assert.doesNotThrow(() => studioEvents.publish('state', { x: 1 }));
  off();
  assert.equal(studioEvents.listenerCount('state'), before);
});
