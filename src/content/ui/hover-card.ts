import { UI_PREFIX } from '../../shared/constants';
import type { UiRoot } from './root';

export interface CardData {
  readonly name: string;
  readonly type: string;
  readonly fileName: string;
  readonly size: string;
  readonly destination: string;
  readonly status: string;
  /** Set when the file is in the index: the framed "Abrir / Mostrar en carpeta" (ADR-016). */
  readonly openFrameUrl: string | null;
  readonly canDownload: boolean;
}

export interface CardLabels {
  readonly type: string;
  readonly file: string;
  readonly size: string;
  readonly destination: string;
  readonly status: string;
  readonly download: string;
  readonly copy: string;
  readonly copied: string;
  readonly openFrameTitle: string;
}

export interface CardActions {
  readonly onDownload: () => void;
  readonly onCopy: () => Promise<void>;
}

/**
 * Details card for one file (spec §3.1): name, type, real file name, size, destination,
 * status and actions. Drawn in the overlay host under the link. All text via textContent.
 */
export class DetailsCard {
  readonly #card: HTMLElement;
  readonly #title: HTMLElement;
  readonly #values: Record<'type' | 'file' | 'size' | 'destination' | 'status', HTMLElement>;
  readonly #actions: HTMLElement;
  readonly #download: HTMLButtonElement;
  readonly #copy: HTMLButtonElement;
  #frame: HTMLIFrameElement | null = null;
  #handlers: CardActions | null = null;

  constructor(
    private readonly overlay: UiRoot,
    private readonly labels: CardLabels,
  ) {
    const doc = overlay.host.ownerDocument;
    const el = (tag: string, className?: string) => {
      const node = doc.createElement(tag);
      if (className !== undefined) node.className = `${UI_PREFIX}${className}`;
      return node;
    };
    this.#card = el('div', 'card');
    this.#card.setAttribute('role', 'group');
    this.#card.hidden = true;
    this.#title = el('p', 'card__title');
    const grid = el('dl', 'card__grid');
    const row = (label: string) => {
      const dt = el('dt');
      dt.textContent = label;
      const dd = el('dd');
      grid.append(dt, dd);
      return dd;
    };
    this.#values = {
      type: row(labels.type),
      file: row(labels.file),
      size: row(labels.size),
      destination: row(labels.destination),
      status: row(labels.status),
    };
    this.#actions = el('div', 'card__actions');
    this.#download = el('button', 'button') as HTMLButtonElement;
    this.#download.type = 'button';
    this.#download.dataset.primary = '';
    this.#download.textContent = labels.download;
    this.#download.addEventListener('click', () => this.#handlers?.onDownload());
    this.#copy = el('button', 'button') as HTMLButtonElement;
    this.#copy.type = 'button';
    this.#copy.textContent = labels.copy;
    this.#copy.addEventListener('click', () => {
      void this.#handlers?.onCopy().then(() => {
        this.#copy.textContent = labels.copied;
      });
    });
    this.#actions.append(this.#download, this.#copy);
    this.#card.append(this.#title, grid, this.#actions);
    this.#card.setAttribute('aria-label', labels.file);
    overlay.layer.append(this.#card);
  }

  get element(): HTMLElement {
    return this.#card;
  }

  get visible(): boolean {
    return !this.#card.hidden;
  }

  show(anchor: Element, data: CardData, handlers: CardActions): void {
    this.#handlers = handlers;
    this.update(data);
    const rect = anchor.getBoundingClientRect();
    const view = this.overlay.host.ownerDocument.defaultView;
    this.#card.style.left = `${Math.round(rect.left + (view?.scrollX ?? 0))}px`;
    this.#card.style.top = `${Math.round(rect.bottom + 6 + (view?.scrollY ?? 0))}px`;
    this.#card.hidden = false;
  }

  update(data: CardData): void {
    this.#title.textContent = data.name;
    this.#values.type.textContent = data.type;
    this.#values.file.textContent = data.fileName;
    this.#values.size.textContent = data.size;
    this.#values.destination.textContent = data.destination;
    this.#values.status.textContent = data.status;
    this.#download.hidden = !data.canDownload;
    this.#copy.textContent = this.labels.copy;
    if (data.openFrameUrl === null) {
      this.#frame?.remove();
      this.#frame = null;
    } else if (this.#frame?.dataset.src !== data.openFrameUrl) {
      this.#frame?.remove();
      const frame = this.overlay.host.ownerDocument.createElement('iframe');
      frame.className = `${UI_PREFIX}toast__frame`;
      frame.title = this.labels.openFrameTitle;
      frame.src = data.openFrameUrl;
      frame.dataset.src = data.openFrameUrl;
      this.#frame = frame;
      this.#actions.append(frame);
    }
  }

  hide(): void {
    this.#card.hidden = true;
    this.#handlers = null;
  }

  contains(node: Node | null): boolean {
    return node !== null && (node === this.overlay.host || this.#card.contains(node));
  }
}
