/**
 * Alarms wake the worker for queued retries (M3) and periodic syncs (M5), which
 * course-sync gates by chrome.idle and network state.
 */
export const QUEUE_ALARM = 'udbsync-queue';
export const SYNC_ALARM = 'udbsync-sync';

/** Schedules (or clears) the wake-up for the next retry. */
export function scheduleQueueWake(at: number | null): void {
  if (at === null) {
    void chrome.alarms.clear(QUEUE_ALARM);
    return;
  }
  void chrome.alarms.create(QUEUE_ALARM, { when: Math.max(at, Date.now() + 1_000) });
}

/** Keeps the periodic sync alarm at `hours`; recreated only when the period changes. */
export async function ensureSyncAlarm(hours: number): Promise<void> {
  const period = hours * 60;
  const existing = await chrome.alarms.get(SYNC_ALARM);
  if (existing?.periodInMinutes === period) return;
  await chrome.alarms.create(SYNC_ALARM, { delayInMinutes: period, periodInMinutes: period });
}
