import { taskId } from '../core/queue/task';
import { sendMessage } from '../shared/browser-api';
import { t, type MessageKey } from '../shared/i18n';
import type {
  DownloadRequestMessage,
  DownloadRequestResponse,
  DownloadUpdateMessage,
} from '../shared/messages';
import type { UiRoot } from './ui/root';
import { showToast, type ToastAction, type ToastHandle } from './ui/toast';

/** Text for an error code, from _locales ("error_<code>"). */
const errorText = (code: string | null) => t(`error_${code ?? 'unknown'}` as MessageKey);

/**
 * Toasts for click-downloads: one per file, updated as the worker reports progress.
 * "Abrir" and "Mostrar en carpeta" buttons give the fresh user gesture that
 * chrome.downloads.open needs when auto-open was blocked (ADR-004).
 */
export class DownloadsUi {
  readonly #toasts = new Map<string, { toast: ToastHandle; name: string }>();
  #sessionNotified = false;

  constructor(private readonly root: UiRoot) {}

  #toast(fileId: string, name: string): ToastHandle {
    const existing = this.#toasts.get(fileId);
    if (existing !== undefined) return existing.toast;
    const toast = showToast(this.root, '', { closeLabel: t('toastClose'), timeoutMs: 0 });
    this.#toasts.set(fileId, { toast, name });
    return toast;
  }

  #fileActions(fileId: string): ToastAction[] {
    const ask = (type: 'download/open' | 'download/show') => () => {
      void sendMessage({ target: 'background', type, fileId });
    };
    return [
      { label: t('dlOpen'), onClick: ask('download/open') },
      { label: t('dlShow'), onClick: ask('download/show') },
    ];
  }

  /** Sends a click-download to the worker and shows the immediate answer. */
  async request(
    message: DownloadRequestMessage,
    name: string,
  ): Promise<DownloadRequestResponse | null> {
    // Progress may arrive before the answer: name the toast first (same id as the worker's).
    this.#toast(taskId(message.courseId, message.cmid, message.file.fileKey), name);
    const result = await sendMessage(message);
    if (!result.ok) {
      showToast(this.root, t('dlFailed', [name, errorText(result.error.code)]), {
        closeLabel: t('toastClose'),
        kind: 'error',
      });
      return null;
    }
    const answer = result.value;
    const toast = this.#toast(answer.fileId, name);
    if (answer.action === 'queued') {
      toast.update(t('dlStarting', name), { timeoutMs: 0 });
    } else if (answer.status === 'actualizado') {
      toast.update(t('dlUpdateSkipped', name), {
        actions: this.#fileActions(answer.fileId),
        timeoutMs: 8000,
      });
    } else {
      const blocked = answer.outcome === 'blocked' || answer.outcome === null;
      toast.update(t('dlUpToDate', name), {
        kind: 'success',
        ...(blocked ? { actions: this.#fileActions(answer.fileId) } : {}),
        timeoutMs: blocked ? 10000 : 4000,
      });
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
    const entry = this.#toasts.get(message.fileId);
    const name = entry?.name ?? message.relativePath?.split('/').pop() ?? '';
    const toast = this.#toast(message.fileId, name);
    const path = message.relativePath ?? '';

    if (message.event === 'opened') {
      if (message.outcome === 'opened')
        toast.update(t('dlOpened', path), { kind: 'success', timeoutMs: 4000 });
      else
        toast.update(t('dlSaved', path), {
          kind: 'success',
          actions: this.#fileActions(message.fileId),
          timeoutMs: 15000,
        });
      return;
    }
    switch (message.state) {
      case 'hecha':
        toast.update(t('dlSaved', path), {
          kind: 'success',
          actions: this.#fileActions(message.fileId),
          timeoutMs: 15000,
        });
        break;
      case 'fallida':
        toast.update(t('dlFailed', [name, errorText(message.errorCode)]), {
          kind: 'error',
          timeoutMs: 0,
        });
        break;
      case 'en_cola':
        toast.update(message.errorCode === null ? t('dlQueued', name) : t('dlRetrying', name), {
          timeoutMs: 0,
        });
        break;
      case 'descargando':
        toast.update(t('dlStarting', name), { timeoutMs: 0 });
        break;
      default:
        break;
    }
  }
}
