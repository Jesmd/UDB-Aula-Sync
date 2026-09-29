import { describe, expect, it } from 'vitest';
import { createRateLimiter, jitterDelay } from '../../../../src/core/http/rate-limiter';
import {
  backoffDelay,
  DEFAULT_BACKOFF,
  isRetryable,
  nextAttemptAt,
  parseRetryAfter,
} from '../../../../src/core/http/retry';
import { appError } from '../../../../src/shared/errors';

/** Manual clock: sleep() advances time instantly. */
function fakeTime() {
  let now = 0;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: (ms: number) => {
      sleeps.push(ms);
      now += ms;
      return Promise.resolve();
    },
    sleeps,
  };
}

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('rate limiter', () => {
  it('runs at most maxConcurrent tasks and spaces starts with jitter', async () => {
    const time = fakeTime();
    const limiter = createRateLimiter({
      maxConcurrent: 2,
      minDelayMs: 300,
      maxDelayMs: 800,
      random: () => 0.5,
      ...time,
    });
    const gates = [deferred(), deferred(), deferred()];
    let running = 0;
    let peak = 0;
    const starts: number[] = [];
    const results = gates.map((gate, i) =>
      limiter.schedule(async () => {
        starts.push(time.now());
        running += 1;
        peak = Math.max(peak, running);
        await gate.promise;
        running -= 1;
        return i;
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(limiter.active).toBe(2);
    expect(limiter.pending).toBe(1);
    gates[0]?.resolve();
    gates[1]?.resolve();
    await new Promise((r) => setTimeout(r, 0));
    gates[2]?.resolve();
    expect(await Promise.all(results)).toEqual([0, 1, 2]);
    expect(peak).toBe(2);
    expect(starts).toEqual([0, 550, 1100]);
  });

  it('propagates failures and keeps going', async () => {
    const limiter = createRateLimiter({
      maxConcurrent: 1,
      minDelayMs: 0,
      maxDelayMs: 0,
      ...fakeTime(),
    });
    await expect(limiter.schedule(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(limiter.schedule(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('keeps jitter inside the range', () => {
    expect(jitterDelay(300, 800, () => 0)).toBe(300);
    expect(jitterDelay(300, 800, () => 1)).toBe(800);
    expect(jitterDelay(300, 800, () => 7)).toBe(800);
  });
});

describe('retry', () => {
  it('retries throttling, network and 5xx; never a lost session', () => {
    expect(isRetryable(appError('rate_limited'))).toBe(true);
    expect(isRetryable(appError('network'))).toBe(true);
    expect(isRetryable(appError('http_status', '503'))).toBe(true);
    expect(isRetryable(appError('http_status', '404'))).toBe(false);
    expect(isRetryable(appError('session_expired'))).toBe(false);
    expect(isRetryable(appError('disk_full'))).toBe(false);
  });

  it('reads Retry-After as seconds or a date', () => {
    const now = Date.parse('Tue, 29 Sep 2026 10:00:00 GMT');
    expect(parseRetryAfter('5', now)).toBe(5_000);
    expect(parseRetryAfter('retry-after=2', now)).toBe(2_000);
    expect(parseRetryAfter('Tue, 29 Sep 2026 10:00:30 GMT', now)).toBe(30_000);
    expect(parseRetryAfter('Tue, 29 Sep 2026 09:00:00 GMT', now)).toBe(0);
    expect(parseRetryAfter('soon', now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter(undefined, now)).toBeNull();
  });

  it('backs off exponentially with jitter, honoring Retry-After', () => {
    expect(backoffDelay(1, null, DEFAULT_BACKOFF, () => 1)).toBe(1_000);
    expect(backoffDelay(3, null, DEFAULT_BACKOFF, () => 1)).toBe(4_000);
    expect(backoffDelay(3, null, DEFAULT_BACKOFF, () => 0)).toBe(2_000);
    expect(backoffDelay(20, null, DEFAULT_BACKOFF, () => 1)).toBe(60_000);
    expect(backoffDelay(1, 90_000, DEFAULT_BACKOFF, () => 1)).toBe(90_000);
  });

  it('schedules the next attempt until attempts run out', () => {
    expect(
      nextAttemptAt(appError('rate_limited', 'retry-after=10'), 1, 0, DEFAULT_BACKOFF, () => 0),
    ).toBe(10_000);
    expect(nextAttemptAt(appError('network'), 1, 100, DEFAULT_BACKOFF, () => 1)).toBe(1_100);
    expect(nextAttemptAt(appError('network'), 4, 0)).toBeNull();
    expect(nextAttemptAt(appError('session_expired'), 1, 0)).toBeNull();
  });
});
