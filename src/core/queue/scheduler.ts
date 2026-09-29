import { ACTIVE_STATES, type Task } from './task';

/** Queued tasks that may start now, oldest first, within the free slots. */
export function runnable(tasks: readonly Task[], now: number, maxConcurrent: number): Task[] {
  const active = tasks.filter((t) => ACTIVE_STATES.has(t.state)).length;
  const slots = Math.max(0, maxConcurrent - active);
  return tasks
    .filter((t) => t.state === 'en_cola' && (t.nextAttemptAt === null || t.nextAttemptAt <= now))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(0, slots);
}

/** Earliest future retry, to wake the worker with an alarm; null when nothing waits. */
export function nextWakeAt(tasks: readonly Task[], now: number): number | null {
  let earliest: number | null = null;
  for (const t of tasks) {
    if (t.state !== 'en_cola' || t.nextAttemptAt === null || t.nextAttemptAt <= now) continue;
    earliest = earliest === null ? t.nextAttemptAt : Math.min(earliest, t.nextAttemptAt);
  }
  return earliest;
}

export type Recovery =
  /** A browser download exists: look it up and continue from its state. */
  | { readonly kind: 'follow'; readonly task: Task; readonly downloadId: number }
  /** Nothing to follow: queue it again. */
  | { readonly kind: 'requeue'; readonly task: Task };

/** What to do with each in-flight task after the worker restarted. */
export function recoveryPlan(tasks: readonly Task[]): Recovery[] {
  return tasks
    .filter((t) => ACTIVE_STATES.has(t.state))
    .map((task) =>
      task.downloadId !== null && task.state !== 'resolviendo'
        ? { kind: 'follow', task, downloadId: task.downloadId }
        : { kind: 'requeue', task },
    );
}
