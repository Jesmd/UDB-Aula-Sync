import { UI_PREFIX } from '../../shared/constants';
import type { UiRoot } from './root';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastOptions {
  readonly kind?: ToastKind;
  /** 0 keeps the toast until the user closes it. */
  readonly timeoutMs?: number;
  readonly closeLabel: string;
  /** Buttons handled by the content script. */
  readonly actions?: readonly ToastAction[];
  /** An element shown in the actions area, e.g. the framed "Abrir" page (ADR-016). */
  readonly embed?: HTMLElement;
}

export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface ToastHandle {
  readonly element: HTMLElement;
  dismiss(): void;
  /** Replaces text, kind, actions and timeout (progress -> result). */
  update(message: string, options: Omit<ToastOptions, 'closeLabel'>): void;
}

const REGION_CLASS = `${UI_PREFIX}toasts`;

function ensureRegion(root: UiRoot): HTMLElement {
  const found = root.layer.querySelector<HTMLElement>(`.${REGION_CLASS}`);
  if (found !== null) return found;
  const region = root.host.ownerDocument.createElement('div');
  region.className = REGION_CLASS;
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  root.layer.append(region);
  return region;
}

/** Shows a toast. Text is set with textContent only: course text is untrusted. */
export function showToast(root: UiRoot, message: string, options: ToastOptions): ToastHandle {
  const doc = root.host.ownerDocument;
  const region = ensureRegion(root);

  const toast = doc.createElement('div');
  toast.className = `${UI_PREFIX}toast`;

  const text = doc.createElement('span');
  text.className = `${UI_PREFIX}toast__text`;

  const actions = doc.createElement('span');
  actions.className = `${UI_PREFIX}toast__actions`;

  const close = doc.createElement('button');
  close.type = 'button';
  close.className = `${UI_PREFIX}toast__close`;
  close.setAttribute('aria-label', options.closeLabel);
  close.textContent = '×';

  toast.append(text, actions, close);
  region.append(toast);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const dismiss = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    toast.remove();
  };
  close.addEventListener('click', dismiss);

  const render = (content: string, next: ToastOptions): void => {
    toast.dataset.kind = next.kind ?? 'info';
    text.textContent = content;
    const buttons = (next.actions ?? []).map((action) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = `${UI_PREFIX}toast__action`;
      button.textContent = action.label;
      button.addEventListener('click', () => {
        action.onClick();
      });
      return button;
    });
    // Moving an iframe reloads it: keep the same embed in place across updates.
    const keepEmbed = next.embed?.parentNode === actions && buttons.length === 0;
    if (!keepEmbed)
      actions.replaceChildren(...buttons, ...(next.embed === undefined ? [] : [next.embed]));
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const timeoutMs = next.timeoutMs ?? 5000;
    if (timeoutMs > 0) timer = setTimeout(dismiss, timeoutMs);
  };
  render(message, options);

  return {
    element: toast,
    dismiss,
    update: (content, next) => {
      if (!toast.isConnected) region.append(toast);
      render(content, { ...next, closeLabel: options.closeLabel });
    },
  };
}
