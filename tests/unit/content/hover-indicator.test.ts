// @vitest-environment jsdom
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installHoverIndicator } from '../../../src/content/hover-indicator';
import { PageContext } from '../../../src/content/page-context';
import { ResolveCache } from '../../../src/content/resolver-client';
import { CursorBadge } from '../../../src/content/ui/cursor-badge';
import { mountUiRoot } from '../../../src/content/ui/root';
import { createRateLimiter } from '../../../src/core/http/rate-limiter';
import type { Resolution } from '../../../src/moodle/resolver/resolve-chain';
import type { AppError } from '../../../src/shared/errors';
import type { Result } from '../../../src/shared/result';
import { courseUrl, readFixture } from '../../helpers/fixtures';

const URL_101 = courseUrl(101, 14);
const LABELS = {
  resolving: 'Preparando…',
  ready: 'Clic para guardar',
  readonly: 'Solo lectura',
  error: 'No disponible',
};

let doc: Document;
let badge: CursorBadge;
let answers: Map<number, Result<Resolution, AppError>>;
let uninstall: () => void;
let gate: Promise<void>;
let openGate: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  gate = new Promise((resolve) => {
    openGate = resolve;
  });
  doc = new JSDOM(readFixture('layouts/onetopic-2level.html'), {
    url: URL_101,
    pretendToBeVisual: true,
  }).window.document;
  answers = new Map([
    [2102, { ok: true, value: { kind: 'readonly' } }],
    [2103, { ok: false, error: { code: 'network' } }],
  ]);
  const cache = new ResolveCache(
    (cmid) => gate.then(() => answers.get(cmid) ?? { ok: false, error: { code: 'unknown' } }),
    Date.now,
    1000,
    createRateLimiter({ maxConcurrent: 2, minDelayMs: 0, maxDelayMs: 0 }),
  );
  badge = new CursorBadge(mountUiRoot(doc, ''), LABELS);
  uninstall = installHoverIndicator({
    doc,
    context: new PageContext(doc, () => URL_101),
    cache,
    badge,
    enabled: () => true,
    delayMs: 400,
  });
});

afterEach(() => {
  uninstall();
  vi.useRealTimers();
});

const view = () => doc.defaultView as unknown as typeof globalThis;
const link = (cmid: number) => {
  const found = doc.querySelector(`#module-${cmid} a.aalink`);
  if (found === null) throw new Error(`no link ${cmid}`);
  return found;
};
const mouse = (type: string, cmid: number, init: MouseEventInit = {}) =>
  link(cmid).dispatchEvent(
    new (view().MouseEvent)(type, { bubbles: true, clientX: 50, clientY: 80, ...init }),
  );

describe('hover indicator', () => {
  it('appears after the hover delay above the pointer and shows the resolved state', async () => {
    mouse('mouseover', 2102);
    await vi.advanceTimersByTimeAsync(399);
    expect(badge.state).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(badge.state).toBe('resolving');
    expect(badge.element.textContent).toBe('Preparando…');
    expect(badge.element.style.left).toBe('50px');
    openGate();
    await vi.runAllTimersAsync();
    expect(badge.state).toBe('readonly');
    expect(badge.element.textContent).toContain('Solo lectura');
  });

  it('reports errors, hides on leave and on click', async () => {
    openGate();
    mouse('mouseover', 2103);
    await vi.runAllTimersAsync();
    expect(badge.state).toBe('error');
    mouse('mouseout', 2103, { relatedTarget: doc.body });
    expect(badge.state).toBeNull();
    mouse('mouseover', 2102);
    await vi.runAllTimersAsync();
    expect(badge.state).toBe('readonly');
    mouse('click', 2102);
    expect(badge.state).toBeNull();
  });

  it('does nothing when the pointer passes by quickly', async () => {
    mouse('mouseover', 2102);
    await vi.advanceTimersByTimeAsync(100);
    mouse('mouseout', 2102, { relatedTarget: doc.body });
    await vi.runAllTimersAsync();
    expect(badge.state).toBeNull();
  });
});
