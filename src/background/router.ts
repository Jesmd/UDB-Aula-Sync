import { extensionVersion } from '../shared/browser-api';
import { MOODLE_ROOT_URL } from '../shared/constants';
import { appError, type AppError } from '../shared/errors';
import { exportLogs, type Logger, type LogRing } from '../shared/logger';
import { parseMessage, type BackgroundRequest, type ResponseFor } from '../shared/messages';
import { err, ok, type Result } from '../shared/result';
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
};

export interface RouterDeps {
  readonly log: Logger;
  readonly ring: LogRing;
}

async function handle(
  message: BackgroundRequest,
  deps: RouterDeps,
): Promise<ResponseFor<BackgroundRequest>> {
  switch (message.type) {
    case 'ping':
      return ok({ version: extensionVersion() });
    case 'content/hello':
      deps.log.info(`content script ready on ${new URL(message.url).pathname}`);
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

    handle(message, deps).then(sendResponse, (cause: unknown) => {
      deps.log.error(`handler ${message.type} threw: ${String(cause)}`);
      sendResponse(err(appError('unknown', message.type)));
    });
    return true;
  };
}
