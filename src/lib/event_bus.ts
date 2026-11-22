/**
 * Minimal in-process pub/sub used to push studio state changes over SSE.
 *
 * No external dependency. Subscribers are isolated per topic and receive only
 * events published after they subscribed. `publish` never throws into callers.
 */

import { EventEmitter } from 'node:events';

export type StudioEventTopic = 'state' | 'ready' | 'heartbeat' | 'job';

export interface StudioEvent<T = unknown> {
  topic: StudioEventTopic;
  payload: T;
  at: string;
}

type Listener = (event: StudioEvent) => void;

class StudioEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  subscribe(topic: StudioEventTopic, listener: Listener): () => void {
    this.emitter.on(topic, listener);
    return () => this.emitter.off(topic, listener);
  }

  publish<T>(topic: StudioEventTopic, payload: T): StudioEvent<T> {
    const event: StudioEvent<T> = { topic, payload, at: new Date().toISOString() };
    try {
      this.emitter.emit(topic, event);
    } catch (err) {
      // A broken SSE client must never break the store write that triggered it.
      console.warn('[event-bus] listener error:', err instanceof Error ? err.message : String(err));
    }
    return event;
  }

  listenerCount(topic: StudioEventTopic): number {
    return this.emitter.listenerCount(topic);
  }
}

export const studioEvents = new StudioEventBus();

/** Format one SSE frame. Data is JSON-encoded so newlines cannot break framing. */
export function formatSseFrame(event: StudioEvent): string {
  return `event: ${event.topic}\ndata: ${JSON.stringify(event)}\n\n`;
}
