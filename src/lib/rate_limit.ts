/**
 * In-memory fixed-window rate limiter for the studio API.
 *
 * Single-process only: limits are per client key and reset after a fixed
 * window. Expired entries are pruned lazily so memory stays bounded during
 * long-running sessions. No external dependency.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private checks = 0;

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {
    if (!Number.isFinite(maxRequests) || maxRequests < 1) throw new Error('maxRequests must be >= 1');
    if (!Number.isFinite(windowMs) || windowMs < 1) throw new Error('windowMs must be >= 1');
  }

  /** Prune expired buckets occasionally; O(n) over active clients only. */
  private prune(now: number): void {
    this.checks += 1;
    if (this.checks % 128 !== 0) return;
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }

  check(key: string, now: number = Date.now()): RateLimitResult {
    this.prune(now);
    const current = this.buckets.get(key);
    if (!current || now >= current.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.maxRequests - 1, retryAfterSec: 0 };
    }
    if (current.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      };
    }
    current.count += 1;
    return { allowed: true, remaining: this.maxRequests - current.count, retryAfterSec: 0 };
  }

  reset(key?: string): void {
    if (key) this.buckets.delete(key);
    else this.buckets.clear();
  }

  get activeBuckets(): number {
    return this.buckets.size;
  }
}
