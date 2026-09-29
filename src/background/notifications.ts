import { MOODLE_ROOT_URL } from '../shared/constants';
import { t } from '../shared/i18n';
import type { NoveltyNotice } from './course-sync';
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
 * Digital tab, once (spec §3.4). System notifications are below.
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

export const NOVELTY_NOTIFICATION = 'udbsync-novelties';
export const SESSION_NOTIFICATION = 'udbsync-session';

/** "Estadística Aplicada: 3 · Redes: 1", longest first, at most 4 courses. */
export function noveltySummary(notices: readonly NoveltyNotice[]): string {
  const sorted = [...notices].sort((a, b) => b.count - a.count);
  const shown = sorted.slice(0, 4).map((n) => `${n.name}: ${n.count}`);
  const rest = sorted.length - shown.length;
  return rest > 0 ? `${shown.join(' · ')} · +${rest}` : shown.join(' · ');
}

const icon = () => chrome.runtime.getURL('icons/icon-128.png');

/** One grouped notification; a newer one replaces it (same id). */
export function showNoveltyNotification(notices: readonly NoveltyNotice[]): void {
  const total = notices.reduce((n, c) => n + c.count, 0);
  void chrome.notifications.create(NOVELTY_NOTIFICATION, {
    type: 'basic',
    iconUrl: icon(),
    title: t('notifyNewTitle', String(total)),
    message: noveltySummary(notices),
    priority: 0,
  });
}

export function showSessionNotification(): void {
  void chrome.notifications.create(SESSION_NOTIFICATION, {
    type: 'basic',
    iconUrl: icon(),
    title: t('notifySessionTitle'),
    message: t('notifySessionBody'),
    priority: 1,
  });
}
