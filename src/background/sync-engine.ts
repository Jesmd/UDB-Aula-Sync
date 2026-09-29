import { isHtml } from '../core/http/content-type';
import { jitterDelay } from '../core/http/rate-limiter';
import { recoveryPlan, nextWakeAt, runnable } from '../core/queue/scheduler';
import { transition, type TaskEvent } from '../core/queue/state-machine';
import { createTask, FINAL_STATES, type NewTask, type Task } from '../core/queue/task';
import { RATE_LIMIT } from '../shared/constants';
import { appError, type AppError } from '../shared/errors';
import type { Logger } from '../shared/logger';
import type { FileRecord } from '../storage/db';
import type { FilesRepo } from '../storage/files-repo';
import type { TasksRepo } from '../storage/tasks-repo';
import {
  interruptError,
  type DownloadBackend,
  type DownloadDelta,
  type DownloadInfo,
} from './download-manager';
import { safeOpen, type OpenOutcome } from './safe-open';

export type QueueEvent =
  | { readonly type: 'task'; readonly task: Task }
  | { readonly type: 'opened'; readonly task: Task; readonly outcome: OpenOutcome }
  /** Sent once when the session is lost; the queue pauses until the user acts again. */
  | { readonly type: 'session_expired' }
  /** A download did not start: probably the "ask where to save" dialog is open (spec §3.6). */
  | { readonly type: 'save_dialog'; readonly task: Task };

export interface QueueDeps {
  readonly tasks: TasksRepo;
  readonly files: FilesRepo;
  readonly backend: DownloadBackend;
  readonly log: Logger;
  readonly notify: (event: QueueEvent) => void;
  /** Wake the worker at this time (chrome.alarms); null cancels. */
  readonly scheduleWake: (at: number | null) => void;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly maxConcurrent?: number;
  /** How long a download may sit at 0 bytes before the save-dialog notice. */
  readonly stallMs?: number;
  readonly setTimer?: (fn: () => void, ms: number) => void;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Persistent download queue. Every change is written to IndexedDB before acting, so a
 * restarted worker can call recover() and continue. All work runs through one promise
 * chain: events from chrome.downloads and new requests never interleave.
 */
export class DownloadQueue {
  readonly #deps: QueueDeps;
  readonly #now: () => number;
  #chain: Promise<void> = Promise.resolve();
  #paused = false;
  #lastStartAt = 0;

  constructor(deps: QueueDeps) {
    this.#deps = deps;
    this.#now = deps.now ?? Date.now;
  }

  get paused(): boolean {
    return this.#paused;
  }

  /** Runs `job` after everything queued before it; errors are logged, never break the chain. */
  #serial<T>(job: () => Promise<T>): Promise<T> {
    const run = this.#chain.then(job);
    this.#chain = run.then(
      () => undefined,
      (cause: unknown) => {
        this.#deps.log.error(`queue job failed: ${String(cause)}`);
      },
    );
    return run;
  }

  async #save(task: Task): Promise<Task> {
    await this.#deps.tasks.put(task);
    this.#deps.notify({ type: 'task', task });
    return task;
  }

  async #apply(task: Task, event: TaskEvent): Promise<Task> {
    const next = transition(task, event, {
      now: this.#now(),
      ...(this.#deps.random === undefined ? {} : { random: this.#deps.random }),
    });
    if (!next.ok) {
      this.#deps.log.warn(`task ${task.id}: ${next.error.detail ?? next.error.code}`);
      return task;
    }
    return this.#save(next.value);
  }

  /**
   * Adds a download. A user action also lifts a session pause: the content script only
   * sends requests it could resolve, so the session works again.
   */
  enqueue(input: NewTask, userInitiated = true): Promise<Task> {
    return this.#serial(async () => {
      if (userInitiated) this.#paused = false;
      const fresh = createTask(input, this.#now());
      const existing = await this.#deps.tasks.get(fresh.id);
      if (existing !== undefined && !FINAL_STATES.has(existing.state)) return existing;
      await this.#save(fresh);
      await this.#pumpNow();
      return fresh;
    });
  }

  pump(): Promise<void> {
    return this.#serial(() => this.#pumpNow());
  }

  async #pumpNow(): Promise<void> {
    const all = await this.#deps.tasks.all();
    if (!this.#paused) {
      for (const task of runnable(
        all,
        this.#now(),
        this.#deps.maxConcurrent ?? RATE_LIMIT.maxConcurrent,
      )) {
        await this.#start(task);
      }
    }
    this.#deps.scheduleWake(
      this.#paused ? null : nextWakeAt(await this.#deps.tasks.all(), this.#now()),
    );
  }

  async #start(queued: Task): Promise<void> {
    // Spacing between request starts (spec §2).
    const gap =
      this.#lastStartAt +
      jitterDelay(RATE_LIMIT.minDelayMs, RATE_LIMIT.maxDelayMs, this.#deps.random) -
      this.#now();
    if (this.#lastStartAt > 0 && gap > 0) await (this.#deps.sleep ?? defaultSleep)(gap);
    this.#lastStartAt = this.#now();

    const task = await this.#apply(queued, { type: 'start' });
    const started = await this.#deps.backend.start({
      url: task.request.url,
      filename: task.request.relativePath,
      conflictAction: task.request.conflictAction,
    });
    if (!started.ok) {
      await this.#fail(task, started.error);
      return;
    }
    const withId = await this.#apply(task, { type: 'started', downloadId: started.value });
    this.#watchStall(withId);
  }

  #watchStall(task: Task): void {
    const setTimer =
      this.#deps.setTimer ?? ((fn: () => void, ms: number) => void setTimeout(fn, ms));
    setTimer(() => {
      void this.#serial(async () => {
        const current = await this.#deps.tasks.get(task.id);
        if (current?.state !== 'descargando' || current.downloadId === null) return;
        const info = await this.#deps.backend.get(current.downloadId);
        if (info?.state === 'in_progress' && info.bytesReceived === 0 && info.filename === '') {
          this.#deps.notify({ type: 'save_dialog', task: current });
        }
      });
    }, this.#deps.stallMs ?? 8_000);
  }

  /** chrome.downloads.onChanged for any download; ignores downloads that are not ours. */
  handleChanged(delta: DownloadDelta): Promise<void> {
    if (delta.state === undefined || delta.state === 'in_progress') return Promise.resolve();
    return this.#serial(async () => {
      const task = await this.#deps.tasks.findByDownloadId(delta.id);
      if (task?.state !== 'descargando') return;
      if (delta.state === 'complete') await this.#finish(task);
      else await this.#fail(task, interruptError(delta.error));
      await this.#pumpNow();
    });
  }

  /** Checks the file, records it in the index and opens it when asked. */
  async #finish(task: Task): Promise<void> {
    const verifying =
      task.state === 'verificando' ? task : await this.#apply(task, { type: 'complete' });
    const info =
      verifying.downloadId === null ? null : await this.#deps.backend.get(verifying.downloadId);
    const problem = this.#verify(verifying, info);
    if (problem !== null || info === null) {
      if (problem?.code === 'session_expired' && verifying.downloadId !== null) {
        // The server sent the login page instead of the file: that HTML is ours to delete.
        await this.#deps.backend.removeFile(verifying.downloadId);
      }
      await this.#fail(verifying, problem ?? appError('verification_failed', 'download not found'));
      return;
    }
    const done = await this.#apply(verifying, { type: 'verified' });
    const record: FileRecord = {
      id: done.id,
      courseId: done.courseId,
      cmid: done.cmid,
      fileKey: done.fileKey,
      fingerprint: done.fingerprint,
      url: done.request.url,
      relativePath: done.request.relativePath,
      localPath: info.filename,
      downloadId: info.id,
      versions: done.versions,
      downloadedAt: this.#now(),
    };
    await this.#deps.files.put(record);
    if (done.request.open) {
      const outcome = await safeOpen(this.#deps.backend, info.id, done.request.extension);
      this.#deps.notify({ type: 'opened', task: done, outcome });
    }
  }

  #verify(task: Task, info: DownloadInfo | null): AppError | null {
    if (info === null) return appError('verification_failed', 'download not found');
    if (!info.exists) return appError('verification_failed', 'file missing after download');
    if (isHtml(info.mime) && !isHtml(task.request.expectedType)) {
      return appError('session_expired', 'got an HTML page instead of the file');
    }
    const size = info.fileSize > 0 ? info.fileSize : info.totalBytes;
    if (task.request.expectedSize !== null && size > 0 && size !== task.request.expectedSize) {
      return appError('verification_failed', `size ${size} != ${task.request.expectedSize}`);
    }
    return null;
  }

  async #fail(task: Task, error: AppError): Promise<void> {
    await this.#apply(task, { type: 'failed', error });
    if (error.code === 'session_expired' && !this.#paused) {
      this.#paused = true;
      this.#deps.notify({ type: 'session_expired' });
    }
  }

  /** After a worker restart: follow downloads still known to the browser, requeue the rest. */
  recover(): Promise<void> {
    return this.#serial(async () => {
      for (const step of recoveryPlan(await this.#deps.tasks.all())) {
        if (step.kind === 'requeue') {
          await this.#apply(step.task, { type: 'requeue' });
          continue;
        }
        const info = await this.#deps.backend.get(step.downloadId);
        if (info === null) {
          await this.#apply(step.task, { type: 'requeue' });
        } else if (info.state === 'complete') {
          await this.#finish(step.task);
        } else if (info.state === 'interrupted') {
          await this.#fail(step.task, interruptError(info.error));
        }
        // in_progress: onChanged will report the end.
      }
      await this.#pumpNow();
    });
  }

  /** "Reintentar fallidos". */
  retryFailed(): Promise<number> {
    return this.#serial(async () => {
      const failed = (await this.#deps.tasks.all()).filter((t) => t.state === 'fallida');
      for (const task of failed) await this.#apply(task, { type: 'retry' });
      this.#paused = false;
      await this.#pumpNow();
      return failed.length;
    });
  }

  /** Waits for queued work (tests). */
  idle(): Promise<void> {
    return this.#serial(() => Promise.resolve());
  }
}
