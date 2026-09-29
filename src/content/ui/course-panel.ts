import { UI_PREFIX } from '../../shared/constants';
import type { UiRoot } from './root';

export interface PanelLabels {
  readonly open: string;
  readonly title: string;
  readonly hint: string;
  readonly section: string;
  readonly all: string;
  readonly onlyNew: string;
  readonly retry: string;
  readonly cancel: string;
  readonly close: string;
  readonly planTitle: string;
}

export interface PanelHandlers {
  readonly onSection: () => void;
  readonly onAll: () => void;
  readonly onNew: () => void;
  readonly onRetry: () => void;
  readonly onCancel: () => void;
}

/** What the dry run found (spec §3.3), already in words. */
export interface PlanView {
  readonly rows: readonly (readonly [label: string, count: number])[];
  readonly total: string;
  readonly note: string | null;
  readonly warning: string | null;
  /** Button text, or null when there is nothing to download. */
  readonly confirmLabel: string | null;
}

/**
 * Floating "Descargas del curso" button and panel (fixed host). Buttons for the section,
 * the whole course, new files only and failed retries; progress; the plan with its
 * confirmation. Everything is plain DOM with textContent.
 */
export class CoursePanel {
  readonly #doc: Document;
  readonly #fab: HTMLButtonElement;
  readonly #panel: HTMLElement;
  readonly #status: HTMLElement;
  readonly #progress: HTMLProgressElement;
  readonly #plan: HTMLElement;
  readonly #buttons: HTMLButtonElement[];
  readonly #cancel: HTMLButtonElement;
  #pending: ((ok: boolean) => void) | null = null;

  constructor(
    root: UiRoot,
    private readonly labels: PanelLabels,
    handlers: PanelHandlers,
  ) {
    this.#doc = root.host.ownerDocument;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) => {
      const node = this.#doc.createElement(tag);
      if (className !== undefined) node.className = `${UI_PREFIX}${className}`;
      return node;
    };
    const button = (text: string, onClick: () => void, primary = false) => {
      const b = el('button', 'button');
      b.type = 'button';
      b.textContent = text;
      if (primary) b.dataset.primary = '';
      b.addEventListener('click', onClick);
      return b;
    };

    this.#fab = el('button', 'fab');
    this.#fab.type = 'button';
    this.#fab.textContent = `⇩ ${labels.open}`;
    this.#fab.setAttribute('aria-expanded', 'false');
    this.#fab.setAttribute('aria-controls', `${UI_PREFIX}panel`);
    this.#fab.addEventListener('click', () => {
      if (this.isOpen) this.close();
      else this.open();
    });

    this.#panel = el('section', 'panel');
    this.#panel.id = `${UI_PREFIX}panel`;
    this.#panel.hidden = true;
    this.#panel.setAttribute('aria-labelledby', `${UI_PREFIX}panel-title`);
    const title = el('h2');
    title.id = `${UI_PREFIX}panel-title`;
    title.textContent = labels.title;
    const hint = el('p', 'muted');
    hint.textContent = labels.hint;
    const row = el('div', 'panel__buttons');
    this.#buttons = [
      button(labels.section, handlers.onSection, true),
      button(labels.all, handlers.onAll),
      button(labels.onlyNew, handlers.onNew),
      button(labels.retry, handlers.onRetry),
    ];
    row.append(...this.#buttons);
    this.#status = el('p');
    this.#status.setAttribute('role', 'status');
    this.#status.setAttribute('aria-live', 'polite');
    this.#progress = el('progress', 'progress');
    this.#progress.hidden = true;
    this.#plan = el('div');
    this.#cancel = button(labels.cancel, () => {
      this.#resolvePlan(false);
      handlers.onCancel();
    });
    this.#cancel.hidden = true;
    const close = button(labels.close, () => {
      this.close();
    });
    const footer = el('div', 'panel__buttons');
    footer.append(this.#cancel, close);
    this.#panel.append(title, hint, row, this.#status, this.#progress, this.#plan, footer);
    this.#panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.close();
    });

    root.layer.append(this.#panel, this.#fab);
  }

  get isOpen(): boolean {
    return !this.#panel.hidden;
  }

  get element(): HTMLElement {
    return this.#panel;
  }

  open(): void {
    this.#panel.hidden = false;
    this.#fab.setAttribute('aria-expanded', 'true');
    this.#buttons[0]?.focus();
  }

  close(): void {
    this.#panel.hidden = true;
    this.#fab.setAttribute('aria-expanded', 'false');
    this.#fab.focus();
  }

  setBusy(busy: boolean): void {
    for (const b of this.#buttons) b.disabled = busy;
    this.#cancel.hidden = !busy;
  }

  setStatus(
    text: string,
    progress: { readonly done: number; readonly total: number } | null = null,
  ): void {
    this.#status.textContent = text;
    this.#progress.hidden = progress === null;
    if (progress !== null) {
      this.#progress.max = Math.max(1, progress.total);
      this.#progress.value = Math.min(progress.done, progress.total);
    }
  }

  /**
   * Shows the plan. With `confirm`, resolves after the user chooses; otherwise resolves
   * true at once (small plans start without asking, spec §3.3).
   */
  showPlan(plan: PlanView, confirm: boolean): Promise<boolean> {
    const box = this.#doc.createElement('div');
    box.className = `${UI_PREFIX}plan`;
    const heading = this.#doc.createElement('h3');
    heading.textContent = this.labels.planTitle;
    const table = this.#doc.createElement('table');
    for (const [label, count] of plan.rows) {
      const tr = table.insertRow();
      const th = this.#doc.createElement('th');
      th.scope = 'row';
      th.textContent = label;
      tr.append(th);
      tr.insertCell().textContent = String(count);
    }
    const total = this.#doc.createElement('p');
    total.textContent = plan.total;
    box.append(heading, table, total);
    if (plan.note !== null) {
      const note = this.#doc.createElement('p');
      note.className = `${UI_PREFIX}muted`;
      note.textContent = plan.note;
      box.append(note);
    }
    if (plan.warning !== null) {
      const warning = this.#doc.createElement('p');
      warning.className = `${UI_PREFIX}warning`;
      warning.textContent = plan.warning;
      box.append(warning);
    }
    this.#plan.replaceChildren(box);
    if (!confirm || plan.confirmLabel === null) return Promise.resolve(plan.confirmLabel !== null);

    const go = this.#doc.createElement('button');
    go.type = 'button';
    go.className = `${UI_PREFIX}button`;
    go.dataset.primary = '';
    go.textContent = plan.confirmLabel;
    box.append(go);
    go.focus();
    return new Promise((resolve) => {
      this.#pending = resolve;
      go.addEventListener('click', () => {
        go.remove();
        this.#resolvePlan(true);
      });
    });
  }

  clearPlan(): void {
    this.#resolvePlan(false);
    this.#plan.replaceChildren();
  }

  #resolvePlan(ok: boolean): void {
    const pending = this.#pending;
    this.#pending = null;
    pending?.(ok);
  }
}
