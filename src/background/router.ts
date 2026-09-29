import { extensionVersion } from '../shared/browser-api';
import { MOODLE_ROOT_URL } from '../shared/constants';
import { appError, type AppError } from '../shared/errors';
import { exportLogs, type Logger, type LogRing } from '../shared/logger';
import { parseMessage, type BackgroundRequest, type ResponseFor } from '../shared/messages';
import { err, ok, type Result } from '../shared/result';
import type { TasksRepo } from '../storage/tasks-repo';
import type { MetaRepo } from '../storage/meta-repo';
import { isLoginUrl } from '../moodle/session';
import type { CourseSync } from './course-sync';
import {
  courseFileStatuses,
  handleDownloadRequest,
  openKnownFile,
  previewDownload,
  type RequestDeps,
} from './requests';
import {
  spikeFetchOffscreen,
  spikeFetchWorker,
  spikeOffscreen,
  spikeOpenViaWorker,
} from './spikes';

export type SenderKind = 'extension-page' | 'udb-content' | 'other';

/** Classifies who sent a message. Anything outside this extension is rejected. */
export function classifySender(
  sender: chrome.runtime.MessageSender,
  extensionId: string,
  extensionOrigin: string,
): SenderKind {
  if (sender.id !== extensionId) return 'other';
  const url = sender.url ?? '';
  // Extension pages opened in a tab (options) also carry sender.tab; the URL decides.
  if (url.startsWith(extensionOrigin)) return 'extension-page';
  if (sender.tab !== undefined && url.startsWith(MOODLE_ROOT_URL)) return 'udb-content';
  return 'other';
}

/** Which senders may use each message type. */
const ALLOWED: Record<BackgroundRequest['type'], readonly SenderKind[]> = {
  ping: ['extension-page', 'udb-content'],
  'content/hello': ['udb-content'],
  'logs/export': ['extension-page'],
  'spike/offscreen': ['extension-page'],
  'spike/open-via-worker': ['extension-page'],
  'spike/fetch-worker': ['extension-page'],
  'spike/fetch-offscreen': ['extension-page'],
  'download/request': ['udb-content'],
  'download/open': ['udb-content', 'extension-page'],
  'download/show': ['udb-content', 'extension-page'],
  'queue/list': ['extension-page'],
  // The framed "Abrir" page (src/open) is an extension page.
  'files/get': ['extension-page'],
  // Also from the course panel on the page.
  'queue/retry-failed': ['extension-page', 'udb-content'],
  'download/preview': ['udb-content'],
  'files/status': ['udb-content'],
  'queue/control': ['extension-page', 'udb-content'],
  'snapshot/save': ['udb-content'],
  'sync/run': ['extension-page'],
  'novelties/clear': ['extension-page'],
};

export interface DownloadServices extends RequestDeps {
  readonly tasks: TasksRepo;
  readonly meta: MetaRepo;
  readonly sync: CourseSync;
}

export interface RouterDeps {
  readonly log: Logger;
  readonly ring: LogRing;
  /** Resolves once the database is open; absent in tests that do not need it. */
  readonly downloads?: () => Promise<DownloadServices>;
}

async function handle(
  message: BackgroundRequest,
  deps: RouterDeps,
  tabId: number | null,
): Promise<ResponseFor<BackgroundRequest>> {
  const needsDownloads =
    /^(download|queue|files|snapshot|sync|novelties)\//.test(message.type) ||
    message.type === 'content/hello';
  const downloads =
    needsDownloads && deps.downloads !== undefined ? await deps.downloads() : undefined;
  switch (message.type) {
    case 'files/get': {
      if (downloads === undefined) return err(appError('unsupported_message', message.type));
      const record = await downloads.files.get(message.fileId);
      if (record?.downloadId == null)
        return err(appError('not_downloadable', 'file not in the index'));
      const name = record.relativePath.split('/').pop() ?? '';
      const extension = name.includes('.') ? (name.split('.').pop() ?? '') : '';
      return ok({ downloadId: record.downloadId, extension, relativePath: record.relativePath });
    }
    case 'download/request':
      if (downloads === undefined) return err(appError('unsupported_message', message.type));
      return handleDownloadRequest(message, tabId, downloads);
    case 'download/preview':
      if (downloads === undefined) return err(appError('unsupported_message', message.type));
      return previewDownload(message, downloads);
    case 'files/status':
      if (downloads === undefined) return err(appError('unsupported_message', message.type));
      return ok({
        files: await courseFileStatuses(message.courseId, downloads),
        novelties:
          (await downloads.sync.noveltiesByCourse())[String(message.courseId)]?.flatMap((n) =>
            n.kind === 'item' ? [n.cmid] : [],
          ) ?? [],
      });
    case 'queue/control': {
      if (downloads === undefined) return err(appError('unsupported_message', message.type));
      let cancelled = 0;
      if (message.action === 'pause') await downloads.queue.pause();
      else if (message.action === 'resume') await downloads.queue.resume();
      else cancelled = await downloads.queue.cancelAll();
      return ok({ paused: downloads.queue.paused, cancelled });
    }
    case 'download/open':
    case 'download/show': {
      if (downloads === undefined) return err(appError('unsupported_message', message.type));
      const result = await openKnownFile(
        message.fileId,
        message.type === 'download/open' ? 'open' : 'show',
        downloads,
      );
      if (!result.ok) return result;
      return message.type === 'download/show'
        ? ok({ shown: true } as const)
        : ok({ outcome: result.value });
    }
    case 'queue/list':
      if (downloads === undefined) return err(appError('unsupported_message', message.type));
      return ok({
        tasks: await downloads.tasks.all(),
        files: await downloads.files.listAll(),
        courses: await downloads.meta.courses(),
        paused: downloads.queue.paused,
        pausedBy: downloads.queue.pausedBy,
        novelties: await downloads.sync.noveltiesByCourse(),
        sync: await downloads.sync.status(),
      });
    case 'snapshot/save':
      if (downloads === undefined) return err(appError('unsupported_message', message.type));
      await downloads.sync.saveSnapshot(message.snapshot);
      return ok({ novelties: 0 });
    case 'sync/run':
      if (downloads === undefined) return err(appError('unsupported_message', message.type));
      return ok(await downloads.sync.run('manual'));
    case 'novelties/clear':
      if (downloads === undefined) return err(appError('unsupported_message', message.type));
      await downloads.sync.clear(message.courseId);
      return ok({ cleared: true } as const);
    case 'queue/retry-failed':
      if (downloads === undefined) return err(appError('unsupported_message', message.type));
      return ok({ retried: await downloads.queue.retryFailed() });
    case 'ping':
      return ok({ version: extensionVersion() });
    case 'content/hello':
      deps.log.info(`content script ready on ${new URL(message.url).pathname}`);
      // Any Aula Digital page other than the login page means the session works again.
      if (downloads !== undefined && !isLoginUrl(message.url)) await downloads.sync.sessionAlive();
      return ok({ accepted: true } as const);
    case 'logs/export':
      return ok({ text: exportLogs(deps.ring.snapshot()) });
    case 'spike/offscreen':
      return spikeOffscreen();
    case 'spike/open-via-worker':
      return spikeOpenViaWorker(message.downloadId);
    case 'spike/fetch-worker':
      return spikeFetchWorker();
    case 'spike/fetch-offscreen':
      return spikeFetchOffscreen();
  }
}

export function createRouter(deps: RouterDeps) {
  const extensionOrigin = chrome.runtime.getURL('');

  return (
    raw: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: Result<unknown, AppError>) => void,
  ): boolean => {
    const parsed = parseMessage(raw);
    if (!parsed.ok) {
      deps.log.warn(`rejected message: ${parsed.error.detail ?? parsed.error.code}`);
      sendResponse(parsed);
      return false;
    }
    const message = parsed.value;
    // Messages for the offscreen document also reach the worker; leave them alone.
    if (message.target !== 'background') return false;

    const kind = classifySender(sender, chrome.runtime.id, extensionOrigin);
    if (!ALLOWED[message.type].includes(kind)) {
      deps.log.warn(`message ${message.type} refused for sender ${kind}`);
      sendResponse(err(appError('unsupported_message', message.type)));
      return false;
    }

    handle(message, deps, sender.tab?.id ?? null).then(sendResponse, (cause: unknown) => {
      deps.log.error(`handler ${message.type} threw: ${String(cause)}`);
      sendResponse(err(appError('unknown', message.type)));
    });
    return true;
  };
}
