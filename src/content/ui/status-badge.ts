import { UI_PREFIX } from '../../shared/constants';
import type { UiRoot } from './root';

export type PillStatus =
  'nuevo' | 'descargado' | 'actualizado' | 'solo_lectura' | 'perdido_local' | 'omitido' | 'error';

/**
 * Status pills beside the course's files, drawn in the overlay host (document
 * coordinates): the page's own layout never moves. Text only via textContent.
 */
export class StatusPills {
  readonly #statuses = new Map<number, PillStatus>();
  readonly #pills = new Map<number, HTMLElement>();

  constructor(
    private readonly overlay: UiRoot,
    private readonly doc: Document,
    private readonly labels: Readonly<Record<PillStatus, string>>,
  ) {}

  get(cmid: number): PillStatus | undefined {
    return this.#statuses.get(cmid);
  }

  set(cmid: number, status: PillStatus | null): void {
    if (status === null) this.#statuses.delete(cmid);
    else this.#statuses.set(cmid, status);
    this.#renderOne(cmid);
  }

  clear(): void {
    this.#statuses.clear();
    for (const pill of this.#pills.values()) pill.remove();
    this.#pills.clear();
  }

  /** Re-anchors every pill (after a resize or a DOM change). */
  render(): void {
    for (const cmid of new Set([...this.#statuses.keys(), ...this.#pills.keys()]))
      this.#renderOne(cmid);
  }

  #anchor(cmid: number): Element | null {
    const item = this.doc.getElementById(`module-${cmid}`);
    return item?.querySelector('.instancename') ?? item?.querySelector('a') ?? null;
  }

  #renderOne(cmid: number): void {
    const status = this.#statuses.get(cmid);
    const anchor = status === undefined ? null : this.#anchor(cmid);
    let pill = this.#pills.get(cmid);
    if (status === undefined || anchor === null) {
      pill?.remove();
      this.#pills.delete(cmid);
      return;
    }
    if (pill === undefined) {
      pill = this.doc.createElement('span');
      pill.className = `${UI_PREFIX}pill`;
      pill.setAttribute('aria-hidden', 'true');
      this.overlay.layer.append(pill);
      this.#pills.set(cmid, pill);
    }
    pill.dataset.status = status;
    pill.dataset.cmid = String(cmid);
    pill.textContent = this.labels[status];
    const rect = anchor.getBoundingClientRect();
    const view = this.doc.defaultView;
    pill.style.left = `${Math.round(rect.right + 8 + (view?.scrollX ?? 0))}px`;
    pill.style.top = `${Math.round(rect.top + rect.height / 2 + (view?.scrollY ?? 0))}px`;
  }
}
