import { errorMessage } from '../shared/error-text';
import { taskId } from '../core/queue/task';
import { UI_PREFIX } from '../shared/constants';
import { sendMessage } from '../shared/browser-api';
import { t } from '../shared/i18n';
import type {
  DownloadRequestMessage,
  DownloadRequestResponse,
  DownloadUpdateMessage,
} from '../shared/messages';
import type { UiRoot } from './ui/root';
import { showToast, type ToastHandle } from './ui/toast';

/** Text for an error code, from _locales ("error_<code>"). */
const errorText = errorMessage;

export const OPEN_PAGE = 'src/open/index.html';

interface Entry {
  readonly toast: ToastHandle;
  readonly name: string;
  frame?: HTMLIFrameElement;
}

/**
 * Toasts for click-downloads: one per file, updated as the worker reports progress.
 * "Abrir" and "Mostrar en carpeta" are an extension page framed in the toast: a click in
 * the page itself would not count as a user gesture for chrome.downloads.open (ADR-016).
 */
export class DownloadsUi {
  readonly #entries = new Map<string, Entry>();
  #sessionNotified = false;

  constructor(private readonly root: UiRoot) {}

  #entry(fileId: string, name: string): Entry {
    const existing = this.#entries.get(fileId);
    if (existing !== undefined) return existing;
    const toast = showToast(this.root, '', { closeLabel: t('toastClose'), timeoutMs: 0 });
    const entry: Entry = { toast, name };
    this.#entries.set(fileId, entry);
    return entry;
  }

  /** The framed "Abrir / Mostrar en carpeta" buttons for a file of the index. */
  #openFrame(fileId: string, entry: Entry): HTMLIFrameElement {
    if (entry.frame !== undefined) return entry.frame;
    const frame = this.root.host.ownerDocument.createElement('iframe');
    frame.className = `${UI_PREFIX}toast__frame`;
    frame.title = `${t('dlOpen')} / ${t('dlShow')}`;
    frame.src = `${chrome.runtime.getURL(OPEN_PAGE)}?id=${encodeURIComponent(fileId)}`;
    entry.frame = frame;
    return frame;
  }

  #saved(fileId: string, entry: Entry, text: string, timeoutMs = 20000): void {
    entry.toast.update(text, { kind: 'success', embed: this.#openFrame(fileId, entry), timeoutMs });
  }

  /** Sends a click-download to the worker and shows the immediate answer. */
  async request(
    message: DownloadRequestMessage,
    name: string,
  ): Promise<DownloadRequestResponse | null> {
    // Progress may arrive before the answer: name the toast first (same id as the worker's).
    this.#entry(taskId(message.courseId, message.cmid, message.file.fileKey), name);
    const result = await sendMessage(message);
    if (!result.ok) {
      showToast(this.root, t('dlFailed', [name, errorText(result.error.code)]), {
        closeLabel: t('toastClose'),
        kind: 'error',
      });
      return null;
    }
    const answer = result.value;
    const entry = this.#entry(answer.fileId, name);
    if (answer.action === 'queued') {
      entry.toast.update(t('dlStarting', name), { timeoutMs: 0 });
    } else if (answer.status === 'ya_existe') {
      // Adopted from the folder (M6): there is no browser download to open.
      entry.toast.update(t('dlAdopted', name), { kind: 'success', timeoutMs: 6000 });
    } else if (answer.status === 'actualizado') {
      this.#saved(answer.fileId, entry, t('dlUpdateSkipped', name));
    } else {
      this.#saved(answer.fileId, entry, t('dlUpToDate', name));
    }
    return answer;
  }

  readOnly(name: string): void {
    showToast(this.root, t('dlReadOnly', name), { closeLabel: t('toastClose') });
  }

  /** Progress from the worker ("content/download-update"). */
  update(message: DownloadUpdateMessage): void {
    if (message.event === 'session_expired') {
      if (this.#sessionNotified) return;
      this.#sessionNotified = true;
      showToast(this.root, t('error_session_expired'), {
        closeLabel: t('toastClose'),
        kind: 'error',
        timeoutMs: 0,
      });
      return;
    }
    if (message.event === 'save_dialog') {
      showToast(this.root, t('dlSaveDialog'), {
        closeLabel: t('toastClose'),
        kind: 'error',
        timeoutMs: 0,
      });
      return;
    }
    if (message.fileId === null) return;
    const known = this.#entries.get(message.fileId);
    const entry = this.#entry(
      message.fileId,
      known?.name ?? message.relativePath?.split('/').pop() ?? '',
    );
    const path = message.relativePath ?? '';

    if (message.event === 'opened') {
      this.#saved(
        message.fileId,
        entry,
        message.outcome === 'opened' ? t('dlOpened', path) : t('dlSaved', path),
      );
      return;
    }
    switch (message.state) {
      case 'hecha':
        this.#saved(message.fileId, entry, t('dlSaved', path));
        break;
      case 'fallida':
        entry.toast.update(t('dlFailed', [entry.name, errorText(message.errorCode)]), {
          kind: 'error',
          timeoutMs: 0,
        });
        break;
      case 'en_cola':
        entry.toast.update(
          message.errorCode === null ? t('dlQueued', entry.name) : t('dlRetrying', entry.name),
          {
            timeoutMs: 0,
          },
        );
        break;
      case 'descargando':
        entry.toast.update(t('dlStarting', entry.name), { timeoutMs: 0 });
        break;
      default:
        break;
    }
  }
}
