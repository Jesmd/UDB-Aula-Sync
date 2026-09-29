import { describe, expect, it } from 'vitest';
import { andThen, err, fromPromise, map, ok, unwrapOr } from '../../../src/shared/result';

describe('result', () => {
  it('maps only Ok values', () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(map(err('x'), (n: number) => n * 2)).toEqual(err('x'));
  });

  it('chains with andThen', () => {
    const half = (n: number) => (n % 2 === 0 ? ok(n / 2) : err('odd'));
    expect(andThen(ok(4), half)).toEqual(ok(2));
    expect(andThen(ok(3), half)).toEqual(err('odd'));
    expect(andThen(err('early'), half)).toEqual(err('early'));
  });

  it('unwraps with a fallback', () => {
    expect(unwrapOr(ok(1), 0)).toBe(1);
    expect(unwrapOr(err('e'), 0)).toBe(0);
  });

  it('captures rejections', async () => {
    expect(await fromPromise(() => Promise.resolve(5), String)).toEqual(ok(5));
    expect(
      await fromPromise(
        () => Promise.reject(new Error('boom')),
        (c) => (c as Error).message,
      ),
    ).toEqual(err('boom'));
  });
});
