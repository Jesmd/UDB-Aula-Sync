import { UI_PREFIX } from '../../shared/constants';
import type { UiRoot } from './root';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastOptions {
  readonly kind?: ToastKind;
  /** 0 keeps the toast until the user closes it. */
  readonly timeoutMs?: number;
  readonly closeLabel: string;
}

export interface ToastHandle {
  readonly element: HTMLElement;
  dismiss(): void;
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
  toast.dataset.kind = options.kind ?? 'info';

  const text = doc.createElement('span');
  text.className = `${UI_PREFIX}toast__text`;
  text.textContent = message;

  const close = doc.createElement('button');
  close.type = 'button';
  close.className = `${UI_PREFIX}toast__close`;
  close.setAttribute('aria-label', options.closeLabel);
  close.textContent = '×';

  toast.append(text, close);
  region.append(toast);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const dismiss = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    toast.remove();
  };
  close.addEventListener('click', dismiss);

  const timeoutMs = options.timeoutMs ?? 5000;
  if (timeoutMs > 0) timer = setTimeout(dismiss, timeoutMs);

  return { element: toast, dismiss };
}
