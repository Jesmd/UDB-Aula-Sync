import { UI_PREFIX } from '../../shared/constants';

export const ROOT_ID = `${UI_PREFIX}root`;

export interface UiRoot {
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;
  /** Container for every injected UI element. */
  readonly layer: HTMLElement;
}

function applyStyles(doc: Document, shadow: ShadowRoot, css: string): void {
  // Constructable sheets are not subject to the page's style-src CSP.
  const view = doc.defaultView;
  if (view !== null && 'replaceSync' in view.CSSStyleSheet.prototype) {
    try {
      const sheet = new view.CSSStyleSheet();
      sheet.replaceSync(css);
      shadow.adoptedStyleSheets = [sheet];
      return;
    } catch {
      // Fall through to a <style> element.
    }
  }
  const style = doc.createElement('style');
  style.textContent = css;
  shadow.append(style);
}

/**
 * Mounts (once) a zero-size fixed host with an open Shadow DOM. Open mode keeps E2E
 * tests simple; the UI holds no secrets (ADR-003). Idempotent across re-injections.
 */
export function mountUiRoot(doc: Document, css: string): UiRoot {
  const existing = doc.getElementById(ROOT_ID);
  if (existing?.shadowRoot) {
    const layer = existing.shadowRoot.querySelector<HTMLElement>(`.${UI_PREFIX}layer`);
    if (layer !== null) return { host: existing, shadow: existing.shadowRoot, layer };
  }
  existing?.remove();

  const host = doc.createElement('div');
  host.id = ROOT_ID;
  host.setAttribute('data-udbsync', '');
  const shadow = host.attachShadow({ mode: 'open' });
  applyStyles(doc, shadow, css);

  const layer = doc.createElement('div');
  layer.className = `${UI_PREFIX}layer`;
  shadow.append(layer);

  // documentElement, not body: the theme may restyle or replace body children.
  doc.documentElement.append(host);
  return { host, shadow, layer };
}
