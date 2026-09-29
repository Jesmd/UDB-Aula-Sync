import { describe, expect, it } from 'vitest';
import { appError, isAppError, toAppError } from '../../../src/shared/errors';

describe('errors', () => {
  it('omits detail when absent', () => {
    expect(appError('network')).toEqual({ code: 'network' });
    expect(appError('network', 'reset')).toEqual({ code: 'network', detail: 'reset' });
  });

  it('recognizes only known codes', () => {
    expect(isAppError({ code: 'session_expired' })).toBe(true);
    expect(isAppError({ code: 'made_up' })).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError('network')).toBe(false);
  });

  it('normalizes thrown values', () => {
    expect(toAppError(new Error('x'), 'storage')).toEqual({ code: 'storage', detail: 'x' });
    expect(toAppError('plain')).toEqual({ code: 'unknown', detail: 'plain' });
    const known = appError('rate_limited');
    expect(toAppError(known)).toBe(known);
  });
});
