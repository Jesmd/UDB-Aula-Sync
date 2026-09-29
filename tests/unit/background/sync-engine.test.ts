import { beforeEach, describe, expect, it } from 'vitest';
import { DownloadQueue, type QueueEvent } from '../../../src/background/sync-engine';
import type { NewTask } from '../../../src/core/queue/task';
import { createLogger } from '../../../src/shared/logger';
import { createMemoryFilesRepo, type FilesRepo } from '../../../src/storage/files-repo';
import { createMemoryTasksRepo, type TasksRepo } from '../../../src/storage/tasks-repo';
import { FakeDownloads } from '../../helpers/fake-downloads';

const input = (cmid: number, over: Partial<NewTask['request']> = {}): NewTask => ({
  courseId: 7,
  cmid,
  fileKey: `mod_resource/content/f${cmid}.pdf`,
  request: {
    url: `https://www.udbvirtual.edu.sv/auladigital/pluginfile.php/${cmid}/mod_resource/content/0/f${cmid}.pdf`,
    relativePath: `UDB/Curso/f${cmid}.pdf`,
    conflictAction: 'uniquify',
    extension: 'pdf',
    expectedSize: 10,
    expectedType: 'application/pdf',
    open: false,
    ...over,
  },
  fingerprint: {
    path: `/p/${cmid}`,
    revision: 0,
    size: 10,
    lastModified: null,
    etag: null,
    contentType: 'application/pdf',
  },
  reason: 'nuevo',
  versions: 1,
  originTabId: 3,
});

let backend: FakeDownloads;
let tasks: TasksRepo;
let files: FilesRepo;
let events: QueueEvent[];
let wakes: (number | null)[];
let now: number;
let timers: (() => void)[];

function makeQueue() {
  return new DownloadQueue({
    tasks,
    files,
    backend,
    log: createLogger('test'),
    notify: (e) => events.push(e),
    scheduleWake: (at) => wakes.push(at),
    now: () => now,
    sleep: (ms) => {
      now += ms;
      return Promise.resolve();
    },
    random: () => 0,
    setTimer: (fn) => timers.push(fn),
  });
}

beforeEach(() => {
  backend = new FakeDownloads();
  tasks = createMemoryTasksRepo();
  files = createMemoryFilesRepo();
  events = [];
  wakes = [];
  now = 1_000_000;
  timers = [];
});

const states = async () => (await tasks.all()).map((t) => [t.cmid, t.state]);

describe('DownloadQueue', () => {
  it('downloads, verifies and indexes a file; the same file twice is one task', async () => {
    const queue = makeQueue();
    await queue.enqueue(input(1));
    await queue.enqueue(input(1));
    expect(backend.started).toEqual([
      { url: input(1).request.url, filename: 'UDB/Curso/f1.pdf', conflictAction: 'uniquify' },
    ]);
    await queue.handleChanged(backend.complete(1));
    expect(await states()).toEqual([[1, 'hecha']]);
    expect(await files.get('7:1:mod_resource/content/f1.pdf')).toMatchObject({
      relativePath: 'UDB/Curso/f1.pdf',
      localPath: '/home/me/Downloads/UDB/Curso/f1.pdf',
      downloadId: 1,
      versions: 1,
    });
    expect(events.flatMap((e) => (e.type === 'task' ? [e.task.state] : []))).toEqual([
      'en_cola',
      'descargando',
      'descargando',
      'verificando',
      'hecha',
    ]);
  });

  it('keeps two downloads at a time, spaced, and starts the next when one ends', async () => {
    const queue = makeQueue();
    for (const cmid of [1, 2, 3]) await queue.enqueue(input(cmid));
    expect(backend.started).toHaveLength(2);
    expect(await states()).toEqual([
      [1, 'descargando'],
      [2, 'descargando'],
      [3, 'en_cola'],
    ]);
    expect(now).toBe(1_000_300);
    await queue.handleChanged(backend.complete(1));
    expect(backend.started).toHaveLength(3);
  });

  it('opens allowlisted files when asked and reports a blocked open', async () => {
    const queue = makeQueue();
    await queue.enqueue(input(1, { open: true }));
    await queue.handleChanged(backend.complete(1));
    expect(backend.opened).toEqual([1]);
    backend.openBlocked = true;
    await queue.enqueue(input(2, { open: true }));
    await queue.handleChanged(backend.complete(2));
    expect(events.flatMap((e) => (e.type === 'opened' ? [e.outcome] : []))).toEqual([
      'opened',
      'blocked',
    ]);
    await queue.enqueue(input(3, { open: true, extension: 'zip', relativePath: 'UDB/a.zip' }));
    await queue.handleChanged(backend.complete(3));
    expect(backend.shown).toEqual([3]);
  });

  it('retries a size mismatch, and gives up after the attempts run out', async () => {
    const queue = makeQueue();
    await queue.enqueue(input(1));
    await queue.handleChanged(backend.complete(1, { fileSize: 9 }));
    const [task] = await tasks.all();
    expect(task).toMatchObject({
      state: 'en_cola',
      lastError: { code: 'verification_failed', detail: 'size 9 != 10' },
    });
    expect(wakes.at(-1)).toBe(task?.nextAttemptAt);
    expect(await files.listAll()).toEqual([]);
  });

  it('pauses everything once when the session is lost, deleting the login page it saved', async () => {
    const queue = makeQueue();
    await queue.enqueue(input(1));
    await queue.enqueue(input(2));
    await queue.enqueue(input(3));
    await queue.handleChanged(backend.complete(1, { mime: 'text/html' }));
    expect(backend.removed).toEqual([1]);
    expect(queue.paused).toBe(true);
    await queue.handleChanged(backend.interrupt(2, 'SERVER_UNAUTHORIZED'));
    expect(events.filter((e) => e.type === 'session_expired')).toHaveLength(1);
    expect(backend.started).toHaveLength(2);
    expect(await states()).toEqual([
      [1, 'fallida'],
      [2, 'fallida'],
      [3, 'en_cola'],
    ]);
    expect(wakes.at(-1)).toBeNull();
    // A new click means the session works again.
    await queue.enqueue(input(4));
    expect(queue.paused).toBe(false);
    expect(backend.started).toHaveLength(4);
    expect(await queue.retryFailed()).toBe(2);
  });

  it('maps browser interrupt reasons', async () => {
    const queue = makeQueue();
    await queue.enqueue(input(1));
    await queue.handleChanged(backend.interrupt(1, 'FILE_NO_SPACE'));
    expect((await tasks.all())[0]?.lastError).toEqual({
      code: 'disk_full',
      detail: 'FILE_NO_SPACE',
    });
    backend.failStart = 'Invalid filename';
    await queue.enqueue(input(2));
    expect((await tasks.get('7:2:mod_resource/content/f2.pdf'))?.lastError?.code).toBe(
      'download_interrupted',
    );
  });

  it('ignores progress deltas and downloads that are not ours', async () => {
    const queue = makeQueue();
    await queue.handleChanged({ id: 99, state: 'complete' });
    await queue.handleChanged({ id: 99 });
    expect(await tasks.all()).toEqual([]);
  });

  it('warns about a save dialog when a download sits at 0 bytes without a file name', async () => {
    const queue = makeQueue();
    await queue.enqueue(input(1));
    timers.shift()?.();
    await queue.idle();
    expect(events.some((e) => e.type === 'save_dialog')).toBe(true);
  });

  it('recovers after a restart: finishes, fails, follows or requeues each task', async () => {
    const first = makeQueue();
    for (const cmid of [1, 2, 3]) await first.enqueue(input(cmid));
    backend.complete(1); // finished while the worker was gone (no event delivered)
    backend.interrupt(2, 'NETWORK_FAILED');
    // A task mid-start with no download id (worker died between start and download()).
    const three = await tasks.get('7:3:mod_resource/content/f3.pdf');
    if (three === undefined) throw new Error();
    await tasks.put({ ...three, state: 'descargando', downloadId: null });

    const second = makeQueue();
    await second.recover();
    const byCmid = Object.fromEntries((await tasks.all()).map((t) => [t.cmid, t]));
    expect(byCmid[1]?.state).toBe('hecha');
    expect(byCmid[2]).toMatchObject({
      state: 'en_cola',
      lastError: { code: 'download_interrupted' },
    });
    expect(byCmid[3]?.state).toBe('descargando');
    expect(backend.started).toHaveLength(3);
  });

  it('pauses and resumes on request, remembering the pause across restarts', async () => {
    const stored: { value?: boolean } = {};
    const pauseStore = {
      get: () => Promise.resolve(stored.value),
      set: (p: boolean) => {
        stored.value = p;
        return Promise.resolve();
      },
    };
    const make = () =>
      new DownloadQueue({
        tasks,
        files,
        backend,
        log: createLogger('test'),
        notify: (e) => events.push(e),
        scheduleWake: (at) => wakes.push(at),
        now: () => now,
        sleep: () => Promise.resolve(),
        setTimer: () => undefined,
        pauseStore,
      });
    const queue = make();
    await queue.pause();
    await queue.enqueue(input(1));
    expect(backend.started).toHaveLength(0);
    expect([queue.paused, queue.pausedBy]).toEqual([true, 'user']);
    const restarted = make();
    await restarted.recover();
    expect(restarted.pausedBy).toBe('user');
    expect(backend.started).toHaveLength(0);
    await restarted.resume();
    expect(backend.started).toHaveLength(1);
    expect(restarted.pausedBy).toBeNull();
  });

  it('cancels queued and running downloads, keeping finished ones', async () => {
    const queue = makeQueue();
    for (const cmid of [1, 2, 3]) await queue.enqueue(input(cmid));
    await queue.handleChanged(backend.complete(1));
    expect(await queue.cancelAll()).toBe(2);
    // 3 started when 1 finished: both running downloads are cancelled in the browser.
    expect(backend.cancelled).toEqual([2, 3]);
    expect(await states()).toEqual([
      [1, 'hecha'],
      [2, 'omitida'],
      [3, 'omitida'],
    ]);
    // The browser's interrupt for the cancelled download is ignored.
    await queue.handleChanged(backend.interrupt(2, 'USER_CANCELED'));
    expect((await tasks.get('7:2:mod_resource/content/f2.pdf'))?.state).toBe('omitida');
  });
});
