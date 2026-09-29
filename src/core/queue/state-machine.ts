import { appError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { TaskState } from '../../shared/types';
import { nextAttemptAt, type BackoffOptions, DEFAULT_BACKOFF } from '../http/retry';
import type { Task } from './task';

export type TaskEvent =
  | { readonly type: 'start' }
  | { readonly type: 'started'; readonly downloadId: number }
  | { readonly type: 'complete' }
  | { readonly type: 'verified' }
  | { readonly type: 'failed'; readonly error: AppError }
  | { readonly type: 'cancel' }
  /** Manual "Reintentar fallidos": fresh attempts. */
  | { readonly type: 'retry' }
  /** Worker restarted while the task was mid-flight without a download to follow. */
  | { readonly type: 'requeue' };

/**
 * en_cola -> descargando -> verificando -> hecha | fallida | omitida.
 * ("resolviendo" is reserved for tasks resolved by the worker itself, M5.)
 */
const ALLOWED: Readonly<Record<TaskEvent['type'], readonly TaskState[]>> = {
  start: ['en_cola'],
  started: ['descargando'],
  complete: ['descargando'],
  verified: ['verificando'],
  failed: ['resolviendo', 'descargando', 'verificando'],
  cancel: ['en_cola', 'resolviendo', 'descargando', 'verificando', 'fallida'],
  retry: ['fallida'],
  requeue: ['resolviendo', 'descargando', 'verificando'],
};

export interface TransitionOptions {
  readonly now: number;
  readonly backoff?: BackoffOptions;
  readonly random?: () => number;
}

export function transition(
  task: Task,
  event: TaskEvent,
  options: TransitionOptions,
): Result<Task, AppError> {
  if (!ALLOWED[event.type].includes(task.state)) {
    return err(appError('invalid_transition', `${event.type} from ${task.state}`));
  }
  const base = { ...task, updatedAt: options.now };
  switch (event.type) {
    case 'start':
      return ok({
        ...base,
        state: 'descargando',
        attempts: task.attempts + 1,
        downloadId: null,
        nextAttemptAt: null,
      });
    case 'started':
      return ok({ ...base, downloadId: event.downloadId });
    case 'complete':
      return ok({ ...base, state: 'verificando' });
    case 'verified':
      return ok({ ...base, state: 'hecha', lastError: null });
    case 'failed': {
      const next = nextAttemptAt(
        event.error,
        task.attempts,
        options.now,
        options.backoff ?? DEFAULT_BACKOFF,
        options.random,
      );
      return ok(
        next === null
          ? { ...base, state: 'fallida', lastError: event.error, nextAttemptAt: null }
          : {
              ...base,
              state: 'en_cola',
              lastError: event.error,
              nextAttemptAt: next,
              downloadId: null,
            },
      );
    }
    case 'cancel':
      return ok({ ...base, state: 'omitida', nextAttemptAt: null });
    case 'retry':
      return ok({ ...base, state: 'en_cola', attempts: 0, nextAttemptAt: null, downloadId: null });
    case 'requeue':
      return ok({ ...base, state: 'en_cola', downloadId: null });
  }
}
