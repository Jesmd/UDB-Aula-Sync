import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classifySender, createRouter } from '../../../src/background/router';
import { createLogger, LogRing } from '../../../src/shared/logger';
import { installChromeStub } from '../../helpers/chrome-stub';

const EXT_ID = 'test-extension-id';
const EXT_ORIGIN = `chrome-extension://${EXT_ID}/`;
const UDB = 'https://www.udbvirtual.edu.sv/auladigital/course/view.php?id=1';
const tab = { id: 1 } as chrome.tabs.Tab;

describe('classifySender', () => {
  it('classifies extension pages, UDB content scripts and others', () => {
    expect(
      classifySender(
        { id: EXT_ID, url: `${EXT_ORIGIN}src/options/index.html` },
        EXT_ID,
        EXT_ORIGIN,
      ),
    ).toBe('extension-page');
    expect(classifySender({ id: EXT_ID, url: UDB, tab }, EXT_ID, EXT_ORIGIN)).toBe('udb-content');
    expect(classifySender({ id: EXT_ID, url: 'https://evil.test/', tab }, EXT_ID, EXT_ORIGIN)).toBe(
      'other',
    );
    expect(classifySender({ id: 'other-ext', url: UDB, tab }, EXT_ID, EXT_ORIGIN)).toBe('other');
    expect(classifySender({ id: EXT_ID, url: `${EXT_ORIGIN}x`, tab }, EXT_ID, EXT_ORIGIN)).toBe(
      'extension-page',
    );
    expect(classifySender({ id: EXT_ID, url: UDB }, EXT_ID, EXT_ORIGIN)).toBe('other');
  });
});

describe('router', () => {
  beforeEach(() => {
    installChromeStub();
  });

  const setup = () => {
    const ring = new LogRing();
    const route = createRouter({ log: createLogger('test', { ring }), ring });
    const call = (raw: unknown, sender: chrome.runtime.MessageSender) =>
      new Promise<unknown>((resolve) => {
        route(raw, sender, resolve);
      });
    return { ring, route, call };
  };

  it('answers ping from an extension page', async () => {
    const { call } = setup();
    await expect(
      call({ target: 'background', type: 'ping' }, { id: EXT_ID, url: `${EXT_ORIGIN}popup.html` }),
    ).resolves.toEqual({ ok: true, value: { version: '0.0.1' } });
  });

  it('accepts hello only from UDB content scripts', async () => {
    const { call, ring } = setup();
    const hello = { target: 'background', type: 'content/hello', url: UDB };
    await expect(call(hello, { id: EXT_ID, url: UDB, tab })).resolves.toMatchObject({ ok: true });
    await expect(call(hello, { id: EXT_ID, url: `${EXT_ORIGIN}x` })).resolves.toMatchObject({
      ok: false,
      error: { code: 'unsupported_message' },
    });
    expect(ring.snapshot().some((e) => e.message.includes('/auladigital/course/view.php'))).toBe(
      true,
    );
  });

  it('refuses spikes from content scripts', async () => {
    const { call } = setup();
    await expect(
      call({ target: 'background', type: 'spike/fetch-worker' }, { id: EXT_ID, url: UDB, tab }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'unsupported_message' } });
  });

  it('rejects invalid messages and ignores offscreen traffic', () => {
    const { route } = setup();
    const respond = vi.fn();
    expect(route({ type: 'nope' }, { id: EXT_ID }, respond)).toBe(false);
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    const ignored = vi.fn();
    expect(route({ target: 'offscreen', type: 'offscreen/ping' }, { id: EXT_ID }, ignored)).toBe(
      false,
    );
    expect(ignored).not.toHaveBeenCalled();
  });

  it('exports logs to extension pages', async () => {
    const { call, ring } = setup();
    ring.push({ ts: 0, level: 'info', scope: 's', message: 'hello' });
    await expect(
      call(
        { target: 'background', type: 'logs/export' },
        { id: EXT_ID, url: `${EXT_ORIGIN}o.html` },
      ),
    ).resolves.toEqual({ ok: true, value: { text: '1970-01-01T00:00:00.000Z INFO s hello' } });
  });
});
