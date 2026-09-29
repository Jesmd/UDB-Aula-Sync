import type {
  DownloadBackend,
  DownloadDelta,
  DownloadInfo,
  StartRequest,
} from '../../src/background/download-manager';
import { appError } from '../../src/shared/errors';
import { err, ok } from '../../src/shared/result';

/** In-memory chrome.downloads: tests drive completion and failures by hand. */
export class FakeDownloads implements DownloadBackend {
  readonly started: StartRequest[] = [];
  readonly items = new Map<number, DownloadInfo>();
  readonly opened: number[] = [];
  readonly shown: number[] = [];
  readonly removed: number[] = [];
  openBlocked = false;
  failStart: string | null = null;
  #next = 1;
  #listeners: ((delta: DownloadDelta) => void)[] = [];

  start(request: StartRequest) {
    if (this.failStart !== null)
      return Promise.resolve(err(appError('download_interrupted', this.failStart)));
    this.started.push(request);
    const id = this.#next++;
    this.items.set(id, {
      id,
      state: 'in_progress',
      filename: '',
      exists: true,
      bytesReceived: 0,
      totalBytes: 0,
      fileSize: 0,
      mime: '',
      error: null,
    });
    return Promise.resolve(ok(id));
  }

  get(id: number) {
    return Promise.resolve(this.items.get(id) ?? null);
  }

  open(id: number) {
    if (this.openBlocked) return Promise.resolve(err(appError('open_blocked', 'no gesture')));
    this.opened.push(id);
    return Promise.resolve(ok(undefined));
  }

  show(id: number) {
    this.shown.push(id);
    return Promise.resolve(ok(undefined));
  }

  readonly cancelled: number[] = [];

  cancel(id: number) {
    this.cancelled.push(id);
    return Promise.resolve();
  }

  removeFile(id: number) {
    this.removed.push(id);
    return Promise.resolve();
  }

  onChanged(listener: (delta: DownloadDelta) => void) {
    this.#listeners.push(listener);
  }

  /** Marks a download finished and emits onChanged. */
  complete(id: number, over: Partial<DownloadInfo> = {}) {
    const item = this.items.get(id);
    if (item === undefined) throw new Error(`no download ${id}`);
    const request = this.started[id - 1];
    const done: DownloadInfo = {
      ...item,
      state: 'complete',
      filename: `/home/me/Downloads/${request?.filename ?? 'x'}`,
      bytesReceived: 10,
      totalBytes: 10,
      fileSize: 10,
      mime: 'application/pdf',
      ...over,
    };
    this.items.set(id, done);
    for (const l of this.#listeners) l({ id, state: 'complete' });
    return { id, state: 'complete' as const };
  }

  interrupt(id: number, error: string) {
    const item = this.items.get(id);
    if (item === undefined) throw new Error(`no download ${id}`);
    this.items.set(id, { ...item, state: 'interrupted', error });
    return { id, state: 'interrupted' as const, error };
  }
}
