import { consoleSink, createLogger, LogRing } from '../shared/logger';
import { openDatabase } from '../storage/db';
import { createFilesRepo } from '../storage/files-repo';
import { loadSettings } from '../storage/settings';
import { createTasksRepo } from '../storage/tasks-repo';
import { QUEUE_ALARM, scheduleQueueWake } from './alarms';
import { createChromeDownloadBackend } from './download-manager';
import { notifyTabs } from './notifications';
import { createRouter, type DownloadServices } from './router';
import { DownloadQueue } from './sync-engine';

// The worker is ephemeral: no state here must survive a restart. The queue lives in
// IndexedDB and recover() picks it up on every start.
const ring = new LogRing();
const log = createLogger('bg', { ring, sinks: [consoleSink] });
const backend = createChromeDownloadBackend();
log.info('worker started');

const services: Promise<DownloadServices> = (async () => {
  const db = await openDatabase();
  const tasks = createTasksRepo(db);
  const files = createFilesRepo(db);
  const queue = new DownloadQueue({
    tasks,
    files,
    backend,
    log: log.child('queue'),
    notify: (event) => void notifyTabs(event),
    scheduleWake: scheduleQueueWake,
  });
  await queue.recover();
  return { tasks, files, backend, queue, settings: loadSettings };
})();
services.catch((cause: unknown) => {
  log.error(`startup failed: ${String(cause)}`);
});

// MV3: every listener is registered synchronously at top level.
chrome.runtime.onInstalled.addListener((details) => {
  log.info(`installed (${details.reason})`);
});
chrome.runtime.onMessage.addListener(createRouter({ log, ring, downloads: () => services }));
backend.onChanged((delta) => {
  void services.then((s) => s.queue.handleChanged(delta));
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === QUEUE_ALARM) void services.then((s) => s.queue.pump());
});
