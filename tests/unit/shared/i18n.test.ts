import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { setMessageLookup, t } from '../../../src/shared/i18n';

const load = (locale: string): Record<string, { message: string }> =>
  JSON.parse(readFileSync(`src/_locales/${locale}/messages.json`, 'utf8')) as Record<
    string,
    { message: string }
  >;

describe('t', () => {
  afterEach(() => {
    setMessageLookup(undefined);
  });

  it('uses the lookup and falls back to the key', () => {
    setMessageLookup((key) => (key === 'toastReady' ? 'Listo' : ''));
    expect(t('toastReady')).toBe('Listo');
    expect(t('toastClose')).toBe('toastClose');
  });

  it('returns the key when chrome.i18n is unavailable', () => {
    expect(t('extName')).toBe('extName');
  });
});

describe('locales', () => {
  it('es and en define the same keys', () => {
    expect(Object.keys(load('en')).sort()).toEqual(Object.keys(load('es')).sort());
  });

  it('every error code has a message', async () => {
    const { ERROR_CODES } = await import('../../../src/shared/errors');
    const es = load('es');
    for (const code of ERROR_CODES) expect(es[`error_${code}`]?.message).toBeTruthy();
  });
});
