/**
 * Alarms wake the worker for queued retries (M3) and, from M5, periodic syncs gated by
 * chrome.idle and network state.
 */
export const QUEUE_ALARM = 'udbsync-queue';

/** Schedules (or clears) the wake-up for the next retry. */
export function scheduleQueueWake(at: number | null): void {
  if (at === null) {
    void chrome.alarms.clear(QUEUE_ALARM);
    return;
  }
  void chrome.alarms.create(QUEUE_ALARM, { when: Math.max(at, Date.now() + 1_000) });
}
