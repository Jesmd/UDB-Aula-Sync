import { RATE_LIMIT } from '../../shared/constants';

export interface RateLimiterOptions {
  readonly maxConcurrent: number;
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
  /** Injected for tests. */
  readonly random?: () => number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface RateLimiter {
  /** Runs `task` when a slot is free and the spacing since the last start has passed. */
  schedule<T>(task: () => Promise<T>): Promise<T>;
  /** Tasks started and not finished. */
  readonly active: number;
  /** Tasks waiting for a slot. */
  readonly pending: number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Spacing with jitter between request starts, inside [min, max]. */
export function jitterDelay(min: number, max: number, random: () => number = Math.random): number {
  return Math.round(min + (max - min) * Math.min(1, Math.max(0, random())));
}

/**
 * At most `maxConcurrent` tasks at once, and each start at least a random 300-800 ms
 * after the previous start (spec §2). Tasks start in FIFO order.
 */
export function createRateLimiter(options: RateLimiterOptions = RATE_LIMIT): RateLimiter {
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const queue: (() => void)[] = [];
  let active = 0;
  let nextStartAt = 0;
  let starting = false;

  const pumpNext = async (): Promise<void> => {
    if (starting || active >= options.maxConcurrent || queue.length === 0) return;
    starting = true;
    const wait = nextStartAt - now();
    if (wait > 0) await sleep(wait);
    const start = queue.shift();
    starting = false;
    if (start === undefined) return;
    active += 1;
    nextStartAt = now() + jitterDelay(options.minDelayMs, options.maxDelayMs, random);
    start();
    void pumpNext();
  };

  return {
    schedule<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          task()
            .then(resolve, reject)
            .finally(() => {
              active -= 1;
              void pumpNext();
            });
        });
        void pumpNext();
      });
    },
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
  };
}
