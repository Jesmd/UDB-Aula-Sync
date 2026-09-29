// @vitest-environment jsdom
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  buildDownloadRequest,
  installInterceptor,
  type InterceptorDeps,
} from '../../../src/content/interceptor';
import type { Activity } from '../../../src/moodle/types';
import { PageContext } from '../../../src/content/page-context';
import { ResolveCache } from '../../../src/content/resolver-client';
import { createRateLimiter } from '../../../src/core/http/rate-limiter';
import { parsePluginfileUrl } from '../../../src/core/http/pluginfile-url';
import type { Resolution } from '../../../src/moodle/resolver/resolve-chain';
import { parseMessage } from '../../../src/shared/messages';
import { courseUrl, readFixture } from '../../helpers/fixtures';

const URL_101 = courseUrl(101, 14);
const FILE_URL =
  'https://www.udbvirtual.edu.sv/auladigital/pluginfile.php/5101/mod_resource/content/1/Presentaci%C3%B3n.pptx';

const fileResolution = (): Resolution => {
  const ref = parsePluginfileUrl(FILE_URL);
  if (ref === null) throw new Error();
  return {
    kind: 'file',
    file: {
      url: FILE_URL,
      ref,
      originalName: 'Presentación.pptx',
      extension: 'pptx',
      contentType: 'application/x',
      size: 5,
      lastModified: null,
      etag: null,
      via: 'redirect',
    },
  };
};

let doc: Document;
let resolver: ReturnType<typeof vi.fn<(cmid: number) => Promise<{ ok: true; value: Resolution }>>>;
let cache: ResolveCache;
let onDownload: Mock<InterceptorDeps['onDownload']>;
let onReadOnly: Mock<(activity: Activity) => void>;
let navigate: Mock<(url: string) => void>;
let enabled: boolean;
let uninstall: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  doc = new JSDOM(readFixture('layouts/onetopic-2level.html'), { url: URL_101 }).window.document;
  resolver = vi.fn((cmid: number) =>
    Promise.resolve({
      ok: true as const,
      value: cmid === 2104 ? ({ kind: 'readonly' } as const) : fileResolution(),
    }),
  );
  cache = new ResolveCache(
    resolver,
    Date.now,
    1000,
    createRateLimiter({ maxConcurrent: 2, minDelayMs: 0, maxDelayMs: 0 }),
  );
  onDownload = vi.fn<InterceptorDeps['onDownload']>();
  onReadOnly = vi.fn<(activity: Activity) => void>();
  navigate = vi.fn<(url: string) => void>();
  enabled = true;
  uninstall = installInterceptor({
    doc,
    context: new PageContext(doc, () => URL_101),
    cache,
    enabled: () => enabled,
    openAfterDownload: () => true,
    onDownload,
    onReadOnly,
    navigate,
    hoverDelayMs: 400,
  });
});

afterEach(() => {
  uninstall();
  vi.useRealTimers();
});

const link = (cmid: number) => {
  const a = doc.querySelector<HTMLAnchorElement>(`#module-${cmid} a.aalink`);
  if (a === null) throw new Error(`no link ${cmid}`);
  return a;
};
const view = () => doc.defaultView as unknown as typeof globalThis;
const hover = (cmid: number) =>
  link(cmid).dispatchEvent(new (view().MouseEvent)('mouseover', { bubbles: true }));
const leave = (cmid: number) =>
  link(cmid).dispatchEvent(new (view().MouseEvent)('mouseout', { bubbles: true }));
const click = (cmid: number, init: MouseEventInit = {}) => {
  const event = new (view().MouseEvent)('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...init,
  });
  link(cmid).dispatchEvent(event);
  return event;
};
const settle = async () => {
  await vi.runAllTimersAsync();
};

describe('interceptor', () => {
  it('resolves after 400 ms of hover, not before, and not when the pointer leaves', async () => {
    hover(2102);
    await vi.advanceTimersByTimeAsync(399);
    leave(2102);
    await settle();
    expect(resolver).not.toHaveBeenCalled();
    hover(2102);
    await settle();
    expect(resolver).toHaveBeenCalledWith(2102);
  });

  it('a click before the resolution waits for it, then downloads (once)', async () => {
    const first = click(2102);
    expect(first.defaultPrevented).toBe(true);
    expect(click(2102).defaultPrevented).toBe(true); // double click while waiting
    expect(onDownload).not.toHaveBeenCalled();
    await settle();
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    const second = click(2102);
    expect(second.defaultPrevented).toBe(true);
    expect(onDownload).toHaveBeenCalledTimes(2);
    const [message, activity] = onDownload.mock.calls[0] as [unknown, { name: string }];
    expect(parseMessage(message).ok).toBe(true);
    expect(message).toMatchObject({
      cmid: 2102,
      open: true,
      section: { name: 'Semana 12', parent: 'Desarrollo', numberWidth: 2 },
    });
    expect(activity.name).toBe('Presentación Semana 12');
  });

  it('an early click on a read-only file follows the link after resolving', async () => {
    expect(click(2104).defaultPrevented).toBe(true);
    await settle();
    expect(onReadOnly).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(link(2104).href);
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('Alt+click downloads without opening; Ctrl/Shift/middle clicks stay native', async () => {
    hover(2102);
    await settle();
    click(2102, { altKey: true });
    expect(onDownload.mock.calls[0]?.[0]).toMatchObject({ open: false });
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      expect(click(2102, init).defaultPrevented).toBe(false);
    }
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('leaves read-only resources, other activities and a disabled setting alone', async () => {
    hover(2104);
    await settle();
    expect(click(2104).defaultPrevented).toBe(false);
    expect(onReadOnly).toHaveBeenCalledTimes(1);
    const assign = doc.querySelector<HTMLAnchorElement>('#module-2105 a');
    assign?.dispatchEvent(new (view().MouseEvent)('click', { bubbles: true, cancelable: true }));
    enabled = false;
    await cache.get(2102);
    expect(click(2102).defaultPrevented).toBe(false);
    expect(onDownload).not.toHaveBeenCalled();
  });
});

describe('ResolveCache', () => {
  it('deduplicates in-flight requests, expires entries and does not cache errors', async () => {
    let now = 0;
    const calls: number[] = [];
    let fail = true;
    const c = new ResolveCache(
      (cmid) => {
        calls.push(cmid);
        return Promise.resolve(
          fail
            ? { ok: false, error: { code: 'network' } }
            : { ok: true, value: { kind: 'readonly' } },
        );
      },
      () => now,
      100,
      createRateLimiter({ maxConcurrent: 2, minDelayMs: 0, maxDelayMs: 0 }),
    );
    await c.get(1);
    expect(c.peek(1)).toBeNull();
    fail = false;
    await Promise.all([c.get(1), c.get(1)]);
    expect(calls).toEqual([1, 1]);
    expect(c.peek(1)).toEqual({ kind: 'readonly' });
    now = 101;
    expect(c.peek(1)).toBeNull();
    await c.get(1);
    c.invalidate(1);
    expect(c.peek(1)).toBeNull();
  });
});

describe('buildDownloadRequest', () => {
  it('returns null for an activity outside the parsed sections', () => {
    const page = new PageContext(doc, () => URL_101).get();
    if (!page.ok) throw new Error();
    const res = fileResolution();
    if (res.kind !== 'file') throw new Error();
    const stranger = {
      cmid: 1,
      modname: 'resource',
      kind: 'file' as const,
      name: 'x',
      url: null,
      available: true,
      restricted: false,
      detailsHint: null,
      downloadCandidate: true,
    };
    expect(buildDownloadRequest(page.value, stranger, res.file, true)).toBeNull();
  });
});
