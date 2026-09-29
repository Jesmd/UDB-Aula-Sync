// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountUiRoot, ROOT_ID } from '../../../src/content/ui/root';
import { showToast } from '../../../src/content/ui/toast';

const CSS = ':host { all: initial; }';

describe('mountUiRoot', () => {
  afterEach(() => {
    document.documentElement.querySelector(`#${ROOT_ID}`)?.remove();
  });

  it('creates one shadow host on documentElement and reuses it', () => {
    const first = mountUiRoot(document, CSS);
    const second = mountUiRoot(document, CSS);
    expect(second.host).toBe(first.host);
    expect(first.host.parentElement).toBe(document.documentElement);
    expect(document.querySelectorAll(`#${ROOT_ID}`)).toHaveLength(1);
    expect(first.shadow.mode).toBe('open');
  });

  it('replaces a stale host without a shadow root', () => {
    const stale = document.createElement('div');
    stale.id = ROOT_ID;
    document.documentElement.append(stale);
    const root = mountUiRoot(document, CSS);
    expect(root.host).not.toBe(stale);
    expect(stale.isConnected).toBe(false);
  });
});

describe('showToast', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.querySelector(`#${ROOT_ID}`)?.remove();
  });

  it('renders untrusted text as text, never as markup', () => {
    const root = mountUiRoot(document, CSS);
    const payload = '<img src=x onerror="alert(1)">Guia 1: Redes';
    const { element } = showToast(root, payload, { closeLabel: 'Cerrar', timeoutMs: 0 });
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toContain(payload);
  });

  it('announces politely and closes by button or timeout', () => {
    vi.useFakeTimers();
    const root = mountUiRoot(document, CSS);
    const region = () => root.layer.querySelector('[role="status"]');

    const a = showToast(root, 'A', { closeLabel: 'Cerrar', timeoutMs: 1000, kind: 'success' });
    expect(region()?.getAttribute('aria-live')).toBe('polite');
    expect(a.element.dataset.kind).toBe('success');
    vi.advanceTimersByTime(1000);
    expect(a.element.isConnected).toBe(false);

    const b = showToast(root, 'B', { closeLabel: 'Cerrar' });
    const close = b.element.querySelector('button');
    expect(close?.getAttribute('aria-label')).toBe('Cerrar');
    close?.click();
    expect(b.element.isConnected).toBe(false);
    expect(root.layer.querySelectorAll('[role="status"]')).toHaveLength(1);
  });
});
