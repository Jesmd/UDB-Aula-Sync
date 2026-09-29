import type { RateLimiter } from './rate-limiter';
import { backoffDelay, DEFAULT_BACKOFF, parseRetryAfter, type BackoffOptions } from './retry';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface PoliteFetchOptions {
  readonly limiter: RateLimiter;
  readonly backoff?: BackoffOptions;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly random?: () => number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const retryable = (status: number) => status === 429 || (status >= 500 && status <= 599);

/**
 * fetch through the shared limiter (2 at a time, 300-800 ms apart) that waits and tries
 * again on 429 and 5xx, honoring Retry-After (spec §2). Network errors are retried too.
 * After the last attempt the response (or error) is returned as is.
 */
export function politeFetch(fetch: Fetch, options: PoliteFetchOptions): Fetch {
  const backoff = options.backoff ?? DEFAULT_BACKOFF;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;

  return async (input, init) => {
    for (let attempt = 1; ; attempt++) {
      const last = attempt >= backoff.maxAttempts;
      let response: Response;
      try {
        response = await options.limiter.schedule(() => fetch(input, init));
      } catch (cause) {
        if (last || init?.signal?.aborted === true) throw cause;
        await sleep(backoffDelay(attempt, null, backoff, random));
        continue;
      }
      if (last || !retryable(response.status)) return response;
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'), now());
      await response.body?.cancel().catch(() => undefined);
      await sleep(backoffDelay(attempt, retryAfter, backoff, random));
    }
  };
}
