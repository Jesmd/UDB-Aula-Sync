import { consoleSink, createLogger, LogRing } from '../shared/logger';
import { createRouter } from './router';

// The worker is ephemeral: keep no state here that must survive a restart.
// Queues and progress will live in IndexedDB / chrome.storage.session (M3).
const ring = new LogRing();
const log = createLogger('bg', { ring, sinks: [consoleSink] });

chrome.runtime.onInstalled.addListener((details) => {
  log.info(`installed (${details.reason})`);
});

chrome.runtime.onMessage.addListener(createRouter({ log, ring }));
