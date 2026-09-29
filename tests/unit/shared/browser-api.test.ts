import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extensionVersion, sendMessage } from '../../../src/shared/browser-api';
import { installChromeStub } from '../../helpers/chrome-stub';

describe('browser-api', () => {
  const sendMessageMock = vi.fn();

  beforeEach(() => {
    sendMessageMock.mockReset();
    installChromeStub();
    (chrome.runtime as unknown as { sendMessage: typeof sendMessageMock }).sendMessage =
      sendMessageMock;
  });

  it('passes through well-formed results', async () => {
    sendMessageMock.mockResolvedValue({ ok: true, value: { version: '1' } });
    await expect(sendMessage({ target: 'background', type: 'ping' })).resolves.toEqual({
      ok: true,
      value: { version: '1' },
    });
    sendMessageMock.mockResolvedValue({ ok: false, error: { code: 'network' } });
    await expect(sendMessage({ target: 'background', type: 'ping' })).resolves.toEqual({
      ok: false,
      error: { code: 'network' },
    });
  });

  it('rejects malformed responses', async () => {
    for (const bad of [undefined, 'x', { ok: true }, { ok: false, error: { code: 'bogus' } }]) {
      sendMessageMock.mockResolvedValue(bad);
      await expect(sendMessage({ target: 'background', type: 'ping' })).resolves.toMatchObject({
        ok: false,
        error: { code: 'invalid_message' },
      });
    }
  });

  it('converts transport errors', async () => {
    sendMessageMock.mockRejectedValue(new Error('Receiving end does not exist.'));
    await expect(sendMessage({ target: 'background', type: 'ping' })).resolves.toEqual({
      ok: false,
      error: { code: 'unknown', detail: 'Receiving end does not exist.' },
    });
  });

  it('reads the manifest version', () => {
    expect(extensionVersion()).toBe('0.0.1');
  });
});
