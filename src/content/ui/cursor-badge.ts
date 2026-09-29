import { UI_PREFIX } from '../../shared/constants';
import type { UiRoot } from './root';

export type BadgeState = 'resolving' | 'ready' | 'readonly' | 'error';

const ICONS: Readonly<Record<BadgeState, string>> = {
  resolving: '',
  ready: '↓',
  readonly: '⊘',
  error: '!',
};

/**
 * Small pill above the pointer on a downloadable file: "Preparando…" with a spinner, then
 * "Clic para guardar" with a bobbing arrow. Decorative (aria-hidden); the toasts carry
 * the accessible feedback.
 */
export class CursorBadge {
  readonly #element: HTMLElement;
  readonly #icon: HTMLElement;
  readonly #text: HTMLElement;
  #frame = 0;

  constructor(
    root: UiRoot,
    private readonly labels: Readonly<Record<BadgeState, string>>,
  ) {
    const doc = root.host.ownerDocument;
    this.#element = doc.createElement('div');
    this.#element.className = `${UI_PREFIX}cursor-badge`;
    this.#element.setAttribute('aria-hidden', 'true');
    this.#icon = doc.createElement('span');
    this.#icon.className = `${UI_PREFIX}cursor-badge__icon`;
    this.#text = doc.createElement('span');
    this.#element.append(this.#icon, this.#text);
    root.layer.append(this.#element);
  }

  get element(): HTMLElement {
    return this.#element;
  }

  get state(): BadgeState | null {
    return this.#element.dataset.visible === 'true'
      ? ((this.#element.dataset.state as BadgeState | undefined) ?? null)
      : null;
  }

  show(state: BadgeState, x: number, y: number): void {
    this.setState(state);
    this.#place(x, y);
    this.#element.dataset.visible = 'true';
  }

  setState(state: BadgeState): void {
    this.#element.dataset.state = state;
    this.#icon.textContent = ICONS[state];
    this.#text.textContent = this.labels[state];
  }

  /** Follows the pointer, at most once per animation frame. */
  move(x: number, y: number): void {
    const view = this.#element.ownerDocument.defaultView;
    if (view === null) return;
    view.cancelAnimationFrame(this.#frame);
    this.#frame = view.requestAnimationFrame(() => {
      this.#place(x, y);
    });
  }

  hide(): void {
    this.#element.dataset.visible = 'false';
  }

  #place(x: number, y: number): void {
    this.#element.style.left = `${Math.round(x)}px`;
    this.#element.style.top = `${Math.round(y)}px`;
  }
}
