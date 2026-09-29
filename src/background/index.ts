import { ACTIVE_STATES, FINAL_STATES } from '../core/queue/task';
import { MOODLE_ROOT_URL } from '../shared/constants';
import { consoleSink, createLogger, LogRing } from '../shared/logger';
import { openDatabase } from '../storage/db';
import { createFilesRepo } from '../storage/files-repo';
import { createMetaRepo } from '../storage/meta-repo';
import { loadSettings } from '../storage/settings';
import { createNoveltiesRepo, createSnapshotsRepo } from '../storage/snapshots-repo';
import { createTasksRepo } from '../storage/tasks-repo';
import { ensureSyncAlarm, QUEUE_ALARM, scheduleQueueWake, SYNC_ALARM } from './alarms';
import { setNoveltyBadge } from './badge';
import { CourseSync } from './course-sync';
import { createChromeDownloadBackend } from './download-manager';
import { FolderVerifier } from './folder-verifier';
import { FOLDER_INFO_KEY } from '../fs-access/folder-info';
import {
  notifyTabs,
  NOVELTY_NOTIFICATION,
  SESSION_NOTIFICATION,
  showNoveltyNotification,
  showSessionNotification,
} from './notifications';
import { sendToOffscreen } from './offscreen-client';
import { handleDownloadRequest } from './requests';
import { createRouter, type DownloadServices } from './router';
import { DownloadQueue } from './sync-engine';

// The worker is ephemeral: no state here must survive a restart. The queue, the index,
// snapshots and novelties live in IndexedDB; recover() picks the queue up on every start.
const ring = new LogRing();
const log = createLogger('bg', { ring, sinks: [consoleSink] });
const backend = createChromeDownloadBackend();
log.info('worker started');

const NOTIFY_COURSE_KEY = 'notify:course';
/** A locked screen skips the periodic sync (spec §3.4). */
const IDLE_SECONDS = 60;

const services: Promise<DownloadServices> = (async () => {
  const db = await openDatabase();
  const tasks = createTasksRepo(db);
  const files = createFilesRepo(db);
  const meta = createMetaRepo(db);
  const queue = new DownloadQueue({
    tasks,
    files,
    backend,
    log: log.child('queue'),
    notify: (event) => {
      void notifyTabs(event);
      if (event.type === 'session_expired') void sync.sessionLost();
      if (event.type === 'task' && event.task.state === 'hecha')
        void sync.downloaded(event.task.courseId, event.task.cmid);
      if (event.type === 'task' && FINAL_STATES.has(event.task.state)) void sync.resumePending();
    },
    scheduleWake: scheduleQueueWake,
    pauseStore: {
      get: () => meta.get<boolean>('queuePaused'),
      set: (paused) => meta.set('queuePaused', paused),
    },
  });
  const verifier = new FolderVerifier({
    configured: async () => (await meta.get(FOLDER_INFO_KEY)) !== undefined,
    scan: async () => {
      const result = await sendToOffscreen({ target: 'offscreen', type: 'offscreen/folder-scan' });
      if (!result.ok) return result;
      const { rootName, takenAt, truncated, files: entries } = result.value;
      return {
        ok: true,
        value: {
          rootName,
          takenAt,
          truncated,
          files: new Map(
            entries.map(([path, size, lastModified]) => [path, { size, lastModified }]),
          ),
        },
      };
    },
    log: log.child('folder'),
  });
  const requestDeps = { files, backend, queue, meta, settings: loadSettings, folder: verifier };
  // Queue events reach `sync` only after startup, once it exists.
  const sync = new CourseSync({
    snapshots: createSnapshotsRepo(db),
    novelties: createNoveltiesRepo(meta),
    files,
    meta,
    settings: loadSettings,
    scan: (courseId, known, skipSections) =>
      sendToOffscreen({
        target: 'offscreen',
        type: 'offscreen/sync-course',
        courseId,
        known: [...known],
        skipSections: [...skipSections],
      }),
    download: async (payload) => {
      const result = await handleDownloadRequest({ ...payload, open: false }, null, requestDeps);
      return result.ok && result.value.action === 'queued';
    },
    online: () => navigator.onLine,
    screenLocked: async () => (await chrome.idle.queryState(IDLE_SECONDS)) === 'locked',
    busy: async () =>
      !queue.paused &&
      (await tasks.all()).some((t) => t.state === 'en_cola' || ACTIVE_STATES.has(t.state)),
    badge: setNoveltyBadge,
    notifyNovelties: (notices) => {
      const first = notices[0];
      if (first !== undefined) void meta.set(NOTIFY_COURSE_KEY, first.courseId);
      showNoveltyNotification(notices);
    },
    notifySessionLost: showSessionNotification,
    log: log.child('sync'),
  });
  await queue.recover();
  await sync.refreshBadge();
  await ensureSyncAlarm((await loadSettings()).syncIntervalHours);
  return {
    tasks,
    files,
    meta,
    backend,
    queue,
    sync,
    verifier,
    folder: verifier,
    settings: loadSettings,
  };
})();
services.catch((cause: unknown) => {
  log.error(`startup failed: ${String(cause)}`);
});

const runSync = (trigger: 'alarm' | 'resume') => {
  void services.then(async (s) => {
    const summary = trigger === 'alarm' ? await s.sync.run('alarm') : await s.sync.resumePending();
    if (summary !== null) log.info(`sync (${trigger}): ${JSON.stringify(summary)}`);
  });
};

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
  if (alarm.name === SYNC_ALARM) runSync('alarm');
});
// A sync put off by a locked screen or no network runs when that changes.
chrome.idle.setDetectionInterval(IDLE_SECONDS);
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'active') runSync('resume');
});
self.addEventListener('online', () => {
  runSync('resume');
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !('settings' in changes)) return;
  void loadSettings().then((settings) => ensureSyncAlarm(settings.syncIntervalHours));
});
chrome.notifications.onClicked.addListener((id) => {
  void chrome.notifications.clear(id);
  if (id === SESSION_NOTIFICATION) {
    void chrome.tabs.create({ url: MOODLE_ROOT_URL });
  } else if (id === NOVELTY_NOTIFICATION) {
    void services.then(async (s) => {
      const courseId = await s.meta.get<number>(NOTIFY_COURSE_KEY);
      await chrome.tabs.create({
        url:
          courseId === undefined
            ? MOODLE_ROOT_URL
            : `${MOODLE_ROOT_URL}course/view.php?id=${courseId}`,
      });
    });
  }
});
