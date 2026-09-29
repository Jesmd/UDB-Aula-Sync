import type { AppError } from '../../shared/errors';
import type { FileStatus, TaskState } from '../../shared/types';
import type { Fingerprint } from '../planning/fingerprint';
import type { ConflictAction } from '../planning/reconcile';

/** Everything chrome.downloads needs; decided before the task is queued. */
export interface DownloadRequest {
  readonly url: string;
  /** Relative to the Downloads folder, "/"-separated, already sanitized. */
  readonly relativePath: string;
  readonly conflictAction: ConflictAction;
  readonly extension: string;
  readonly expectedSize: number | null;
  readonly expectedType: string | null;
  /** Open the file when it is done (safe-open policy still applies). */
  readonly open: boolean;
}

/**
 * One file to download. Persisted after every transition so the queue survives a
 * service worker restart; the id makes enqueueing the same file twice a no-op.
 */
export interface Task {
  readonly id: string;
  readonly courseId: number;
  readonly cmid: number;
  readonly fileKey: string;
  readonly state: TaskState;
  readonly request: DownloadRequest;
  readonly fingerprint: Fingerprint;
  /** Why it downloads: nuevo, actualizado or perdido_local. */
  readonly reason: FileStatus;
  /** Local versions after this download (for "conservar ambas"). */
  readonly versions: number;
  readonly attempts: number;
  readonly downloadId: number | null;
  readonly lastError: AppError | null;
  readonly nextAttemptAt: number | null;
  /** Tab that asked, to report progress; null for background syncs. */
  readonly originTabId: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export function taskId(courseId: number, cmid: number, fileKey: string): string {
  return `${courseId}:${cmid}:${fileKey}`;
}

export type NewTask = Omit<
  Task,
  | 'id'
  | 'state'
  | 'attempts'
  | 'downloadId'
  | 'lastError'
  | 'nextAttemptAt'
  | 'createdAt'
  | 'updatedAt'
>;

export function createTask(input: NewTask, now: number): Task {
  return {
    ...input,
    id: taskId(input.courseId, input.cmid, input.fileKey),
    state: 'en_cola',
    attempts: 0,
    downloadId: null,
    lastError: null,
    nextAttemptAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export const ACTIVE_STATES: ReadonlySet<TaskState> = new Set([
  'resolviendo',
  'descargando',
  'verificando',
]);
export const FINAL_STATES: ReadonlySet<TaskState> = new Set(['hecha', 'fallida', 'omitida']);
