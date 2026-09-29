import { describe, expect, it } from 'vitest';
import { parseMessage } from '../../../src/shared/messages';

describe('parseMessage', () => {
  it('accepts known messages', () => {
    const result = parseMessage({ target: 'background', type: 'ping' });
    expect(result.ok).toBe(true);
  });

  it('validates payload fields', () => {
    expect(
      parseMessage({ target: 'background', type: 'content/hello', url: 'https://x.test/a' }).ok,
    ).toBe(true);
    expect(parseMessage({ target: 'background', type: 'content/hello', url: 'not a url' }).ok).toBe(
      false,
    );
    expect(
      parseMessage({ target: 'background', type: 'spike/open-via-worker', downloadId: -1 }).ok,
    ).toBe(false);
  });

  it('rejects unknown types and garbage', () => {
    for (const raw of [null, 'ping', {}, { target: 'background', type: 'rm -rf' }]) {
      const result = parseMessage(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('invalid_message');
    }
  });

  it('keeps offscreen messages apart', () => {
    const result = parseMessage({ target: 'offscreen', type: 'offscreen/ping' });
    expect(result.ok && result.value.target).toBe('offscreen');
  });
});
