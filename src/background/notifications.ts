import { MOODLE_ROOT_URL } from '../shared/constants';
import type { DownloadUpdateMessage } from '../shared/messages';
import type { QueueEvent } from './sync-engine';

/** Builds the progress message for the tab that asked (all fields present, validated there). */
export function updateMessage(event: QueueEvent): DownloadUpdateMessage {
  const task =
    event.type === 'task' || event.type === 'opened' || event.type === 'save_dialog'
      ? event.task
      : null;
  return {
    target: 'content',
    type: 'content/download-update',
    event: event.type,
    fileId: task?.id ?? null,
    cmid: task?.cmid ?? null,
    state: task?.state ?? null,
    relativePath: task?.request.relativePath ?? null,
    outcome: event.type === 'opened' ? event.outcome : null,
    errorCode: task?.lastError?.code ?? null,
  };
}

/**
 * Reports queue events to the tab that asked. A lost session is told to every Aula
 * Digital tab, once (spec §3.4). M5 adds system notifications for background syncs.
 */
export async function notifyTabs(event: QueueEvent): Promise<void> {
  const message = updateMessage(event);
  const send = (tabId: number) => chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
  if (event.type === 'session_expired') {
    const tabs = await chrome.tabs.query({ url: `${MOODLE_ROOT_URL}*` });
    await Promise.all(tabs.flatMap((t) => (t.id === undefined ? [] : [send(t.id)])));
    return;
  }
  const tabId = event.task.originTabId;
  if (tabId !== null) await send(tabId);
}
