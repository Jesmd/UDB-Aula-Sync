import type { ConflictAction } from '../core/planning/reconcile';
import { appError, type AppError } from '../shared/errors';
import { err, fromPromise, ok, type Result } from '../shared/result';

export interface DownloadInfo {
  readonly id: number;
  readonly state: 'in_progress' | 'interrupted' | 'complete';
  /** Absolute local path; '' until the browser has chosen it. */
  readonly filename: string;
  readonly exists: boolean;
  readonly bytesReceived: number;
  readonly totalBytes: number;
  readonly fileSize: number;
  readonly mime: string;
  readonly error: string | null;
}

export interface DownloadDelta {
  readonly id: number;
  readonly state?: 'in_progress' | 'interrupted' | 'complete';
  readonly error?: string;
}

export interface StartRequest {
  readonly url: string;
  /** Relative to Downloads; chrome.downloads refuses absolute paths and "..". */
  readonly filename: string;
  readonly conflictAction: ConflictAction;
}

/** Writes and opens files (chrome.downloads). Reading folders is FolderVerifier's job (M6). */
export interface DownloadBackend {
  start(request: StartRequest): Promise<Result<number, AppError>>;
  get(id: number): Promise<DownloadInfo | null>;
  open(id: number): Promise<Result<void, AppError>>;
  show(id: number): Promise<Result<void, AppError>>;
  /** Deletes a file this extension just wrote by mistake (e.g. a login page saved as a PDF). */
  removeFile(id: number): Promise<void>;
  onChanged(listener: (delta: DownloadDelta) => void): void;
}

/** chrome.downloads interrupt reasons mapped to the error taxonomy. */
export function interruptError(reason: string | null | undefined): AppError {
  const r = reason ?? 'UNKNOWN';
  if (r === 'FILE_NO_SPACE' || r === 'FILE_TOO_LARGE') return appError('disk_full', r);
  if (r === 'USER_CANCELED' || r === 'USER_SHUTDOWN') return appError('cancelled', r);
  if (r === 'SERVER_UNAUTHORIZED' || r === 'SERVER_FORBIDDEN')
    return appError('session_expired', r);
  if (
    /^FILE_(ACCESS_DENIED|NAME_TOO_LONG|BLOCKED|SECURITY_CHECK_FAILED|VIRUS_INFECTED|HASH_MISMATCH|SAME_AS_SOURCE)$/.test(
      r,
    )
  ) {
    return appError('file_rejected', r);
  }
  return appError('download_interrupted', r);
}

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

function toInfo(item: chrome.downloads.DownloadItem): DownloadInfo {
  return {
    id: item.id,
    state: item.state,
    filename: item.filename,
    exists: item.exists,
    bytesReceived: item.bytesReceived,
    totalBytes: item.totalBytes,
    fileSize: item.fileSize,
    mime: item.mime,
    error: item.error ?? null,
  };
}

/**
 * chrome.downloads implementation. Never registers onDeterminingFilename: doing so makes
 * Chrome ignore the requested filename (spec §6).
 */
export function createChromeDownloadBackend(): DownloadBackend {
  return {
    start: (request) =>
      fromPromise(
        () =>
          chrome.downloads.download({
            url: request.url,
            filename: request.filename,
            conflictAction: request.conflictAction,
            saveAs: false,
          }),
        // "Invalid filename" is final (e.g. a non-UTF-8 locale on Linux rejects accents).
        (cause) =>
          /invalid filename/i.test(message(cause))
            ? appError('file_rejected', message(cause))
            : appError('download_interrupted', message(cause)),
      ),
    get: async (id) => {
      const [item] = await chrome.downloads.search({ id });
      return item === undefined ? null : toInfo(item);
    },
    open: async (id) => {
      try {
        await chrome.downloads.open(id);
        return ok(undefined);
      } catch (cause) {
        return err(appError('open_blocked', message(cause)));
      }
    },
    show: async (id) => {
      try {
        chrome.downloads.show(id);
        return await Promise.resolve(ok(undefined));
      } catch (cause) {
        return err(appError('open_blocked', message(cause)));
      }
    },
    removeFile: async (id) => {
      await chrome.downloads.removeFile(id).catch(() => undefined);
    },
    onChanged: (listener) => {
      chrome.downloads.onChanged.addListener((delta) => {
        const state = delta.state?.current as DownloadDelta['state'];
        const error = delta.error?.current;
        listener({
          id: delta.id,
          ...(state === undefined ? {} : { state }),
          ...(error === undefined ? {} : { error }),
        });
      });
    },
  };
}
