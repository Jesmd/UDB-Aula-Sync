import type { AppError, ErrorCode } from '../../shared/errors';

export interface BackoffOptions {
  readonly baseMs: number;
  readonly maxMs: number;
  readonly maxAttempts: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 1_000, maxMs: 60_000, maxAttempts: 4 };

/** Errors worth another attempt. A lost session is never retried: the sync stops (spec §2). */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  'rate_limited',
  'network',
  'download_interrupted',
  'verification_failed',
]);

export function isRetryable(error: AppError): boolean {
  if (error.code === 'http_status') return /^5\d\d$/.test(error.detail ?? '');
  return RETRYABLE.has(error.code);
}

/**
 * Retry-After as seconds or an HTTP date; null when absent or unreadable.
 * Accepts the raw header or the "retry-after=<value>" detail of a rate_limited error.
 */
export function parseRetryAfter(value: string | null | undefined, now: number): number | null {
  if (value === null || value === undefined) return null;
  const raw = value.replace(/^retry-after=/, '').trim();
  if (/^\d+$/.test(raw)) return Number(raw) * 1_000;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/**
 * Delay before attempt `attempt` (1 = first retry): exponential with full jitter, never less
 * than the server's Retry-After, capped at maxMs (except that Retry-After always wins).
 */
export function backoffDelay(
  attempt: number,
  retryAfterMs: number | null,
  options: BackoffOptions = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(options.maxMs, options.baseMs * 2 ** Math.max(0, attempt - 1));
  const jittered = Math.round(exponential / 2 + (exponential / 2) * random());
  return retryAfterMs === null ? jittered : Math.max(retryAfterMs, jittered);
}

/** Next attempt time, or null when the error is final or attempts are exhausted. */
export function nextAttemptAt(
  error: AppError,
  attemptsSoFar: number,
  now: number,
  options: BackoffOptions = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number | null {
  if (!isRetryable(error) || attemptsSoFar >= options.maxAttempts) return null;
  const retryAfter = error.code === 'rate_limited' ? parseRetryAfter(error.detail, now) : null;
  return now + backoffDelay(attemptsSoFar, retryAfter, options, random);
}
