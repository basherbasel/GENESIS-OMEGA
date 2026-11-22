/**
 * Single-worker in-process job queue with visible ids and status transitions.
 *
 * Time/space: enqueue O(1), serial drain over pending jobs. At most one job
 * executes at a time, so the real OS verifier is never run concurrently.
 * Failures are recorded per job and never stop the queue.
 */

import { studioEvents } from './event_bus';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface Job<T = unknown, R = unknown> {
  id: number;
  type: string;
  payload: T;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: R;
  error?: string;
}

export type JobHandler = (payload: never) => Promise<unknown>;

export class JobQueue {
  private readonly jobs = new Map<number, Job>();
  private readonly pending: Job[] = [];
  private nextId = 1;
  private draining = false;
  private handler: JobHandler | null = null;

  setHandler(handler: JobHandler): void {
    this.handler = handler;
  }

  enqueue<T, R>(type: string, payload: T): Job<T, R> {
    const job: Job<T, R> = {
      id: this.nextId++,
      type,
      payload,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job as Job);
    this.pending.push(job as Job);
    this.publish(job);
    void this.drain();
    return job;
  }

  private publish(job: Job): void {
    studioEvents.publish('job', {
      id: job.id,
      type: job.type,
      status: job.status,
      error: job.error,
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending.length > 0) {
        const job = this.pending.shift()!;
        job.status = 'running';
        job.startedAt = new Date().toISOString();
        this.publish(job);
        try {
          if (!this.handler) throw new Error('no job handler registered');
          job.result = await this.handler(job.payload as never);
          job.status = 'done';
        } catch (err) {
          job.error = err instanceof Error ? err.message : String(err);
          job.status = 'failed';
        }
        job.finishedAt = new Date().toISOString();
        this.publish(job);
      }
    } finally {
      this.draining = false;
    }
  }

  get(id: number): Job | undefined {
    return this.jobs.get(id);
  }

  list(): Job[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.id - a.id);
  }

  get activeCount(): number {
    return this.pending.length + (this.draining ? 1 : 0);
  }
}

export const studioJobs = new JobQueue();
