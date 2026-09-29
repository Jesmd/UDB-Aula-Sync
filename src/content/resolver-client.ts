import { createRateLimiter, type RateLimiter } from '../core/http/rate-limiter';
import { PROBE_CACHE_TTL_MS, RATE_LIMIT } from '../shared/constants';
import type { AppError } from '../shared/errors';
import type { Result } from '../shared/result';
import type { Resolution } from '../moodle/resolver/resolve-chain';

type Resolver = (cmid: number) => Promise<Result<Resolution, AppError>>;

/**
 * Resolutions per activity, cached for 12 h (spec §3.1) and deduplicated while in
 * flight. Every request goes through the rate limiter. Errors are not cached.
 */
export class ResolveCache {
  readonly #entries = new Map<number, { readonly at: number; readonly value: Resolution }>();
  readonly #inflight = new Map<number, Promise<Result<Resolution, AppError>>>();
  readonly #limiter: RateLimiter;

  constructor(
    private readonly resolver: Resolver,
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = PROBE_CACHE_TTL_MS,
    limiter: RateLimiter = createRateLimiter(RATE_LIMIT),
  ) {
    this.#limiter = limiter;
  }

  /** Cached resolution, if fresh. Synchronous: used inside click handlers. */
  peek(cmid: number): Resolution | null {
    const entry = this.#entries.get(cmid);
    if (entry === undefined) return null;
    if (this.now() - entry.at > this.ttlMs) {
      this.#entries.delete(cmid);
      return null;
    }
    return entry.value;
  }

  get(cmid: number): Promise<Result<Resolution, AppError>> {
    const cached = this.peek(cmid);
    if (cached !== null) return Promise.resolve({ ok: true, value: cached });
    const running = this.#inflight.get(cmid);
    if (running !== undefined) return running;
    const request = this.#limiter
      .schedule(() => this.resolver(cmid))
      .then((result) => {
        if (result.ok) this.#entries.set(cmid, { at: this.now(), value: result.value });
        return result;
      })
      .finally(() => this.#inflight.delete(cmid));
    this.#inflight.set(cmid, request);
    return request;
  }

  invalidate(cmid: number): void {
    this.#entries.delete(cmid);
  }
}
