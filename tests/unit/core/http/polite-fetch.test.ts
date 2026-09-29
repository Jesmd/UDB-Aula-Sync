import { describe, expect, it, vi } from 'vitest';
import { politeFetch } from '../../../../src/core/http/polite-fetch';
import { createRateLimiter } from '../../../../src/core/http/rate-limiter';

const limiter = () => createRateLimiter({ maxConcurrent: 2, minDelayMs: 0, maxDelayMs: 0 });
const backoff = { baseMs: 1_000, maxMs: 60_000, maxAttempts: 3 };

function setup(responses: (Response | Error)[]) {
  const fetch = vi.fn(() => {
    const next = responses.shift();
    if (next === undefined) throw new Error('no more responses');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const waits: number[] = [];
  const polite = politeFetch(fetch, {
    limiter: limiter(),
    backoff,
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
    now: () => 0,
    random: () => 1,
  });
  return { fetch, polite, waits };
}

describe('politeFetch', () => {
  it('passes normal responses through, including 4xx', async () => {
    const { polite, fetch, waits } = setup([new Response('x', { status: 404 })]);
    expect((await polite('https://a/')).status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it('waits on 429 honoring Retry-After and on 5xx with backoff, then succeeds', async () => {
    const { polite, waits } = setup([
      new Response('', { status: 429, headers: { 'retry-after': '5' } }),
      new Response('', { status: 503 }),
      new Response('ok'),
    ]);
    const response = await polite('https://a/');
    expect(await response.text()).toBe('ok');
    expect(waits).toEqual([5_000, 2_000]);
  });

  it('gives up after the last attempt and retries network errors', async () => {
    const failing = setup([
      new Response('', { status: 500 }),
      new Response('', { status: 500 }),
      new Response('', { status: 500 }),
    ]);
    expect((await failing.polite('https://a/')).status).toBe(500);
    expect(failing.fetch).toHaveBeenCalledTimes(3);

    const offline = setup([new Error('a'), new Error('b'), new Error('c')]);
    await expect(offline.polite('https://a/')).rejects.toThrow('c');
    expect(offline.waits).toHaveLength(2);
  });

  it('does not retry an aborted request', async () => {
    const aborted = setup([new Error('aborted')]);
    const controller = new AbortController();
    controller.abort();
    await expect(aborted.polite('https://a/', { signal: controller.signal })).rejects.toThrow();
    expect(aborted.fetch).toHaveBeenCalledTimes(1);
  });
});
