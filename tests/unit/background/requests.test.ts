import { beforeEach, describe, expect, it } from 'vitest';
import {
  handleDownloadRequest,
  openKnownFile,
  type RequestDeps,
} from '../../../src/background/requests';
import { DownloadQueue } from '../../../src/background/sync-engine';
import type { DownloadRequestMessage } from '../../../src/shared/messages';
import { createLogger } from '../../../src/shared/logger';
import type { UpdatePolicy } from '../../../src/shared/types';
import { createMemoryFilesRepo, type FilesRepo } from '../../../src/storage/files-repo';
import { DEFAULT_SETTINGS } from '../../../src/storage/settings-schema';
import { createMemoryTasksRepo, type TasksRepo } from '../../../src/storage/tasks-repo';
import { FakeDownloads } from '../../helpers/fake-downloads';

const ROOT = 'https://www.udbvirtual.edu.sv/auladigital/';

const message = (
  cmid: number,
  over: Partial<DownloadRequestMessage['file']> = {},
  name = 'Guia 1: Redes',
): DownloadRequestMessage => ({
  target: 'background',
  type: 'download/request',
  courseId: 101,
  cmid,
  course: {
    fullName: 'Estadística Aplicada ESA501 G01T (Soyapango)',
    shortName: 'ESA5012026C02G01TCS',
  },
  section: { name: 'Semana 2', parent: 'Desarrollo', position: 4, numberWidth: 2 },
  activityName: name,
  file: {
    url: `${ROOT}pluginfile.php/${cmid}/mod_resource/content/0/guia.pdf`,
    fileKey: 'mod_resource/content/guia.pdf',
    path: `/pluginfile.php/${cmid}/mod_resource/content/0/guia.pdf`,
    revision: 0,
    originalName: 'guia.pdf',
    extension: 'pdf',
    size: 10,
    lastModified: 'Mon, 14 Sep 2026 15:00:00 GMT',
    etag: '"a"',
    contentType: 'application/pdf',
    ...over,
  },
  open: true,
});

let backend: FakeDownloads;
let files: FilesRepo;
let tasks: TasksRepo;
let queue: DownloadQueue;
let policy: UpdatePolicy;
let deps: RequestDeps;

beforeEach(() => {
  backend = new FakeDownloads();
  files = createMemoryFilesRepo();
  tasks = createMemoryTasksRepo();
  policy = 'conservar_ambas';
  queue = new DownloadQueue({
    tasks,
    files,
    backend,
    log: createLogger('t'),
    notify: () => undefined,
    scheduleWake: () => undefined,
    sleep: () => Promise.resolve(),
    setTimer: () => undefined,
  });
  deps = {
    files,
    backend,
    queue,
    settings: () => Promise.resolve({ ...DEFAULT_SETTINGS, updatePolicy: policy }),
  };
});

async function downloadOnce(msg: DownloadRequestMessage) {
  const result = await handleDownloadRequest(msg, 5, deps);
  if (!result.ok) throw new Error(result.error.code);
  await queue.handleChanged(backend.complete(backend.started.length));
  return result.value;
}

describe('handleDownloadRequest', () => {
  it('queues a new file at its course path', async () => {
    const result = await handleDownloadRequest(message(1), 5, deps);
    expect(result).toEqual({
      ok: true,
      value: {
        status: 'nuevo',
        action: 'queued',
        fileId: '101:1:mod_resource/content/guia.pdf',
        relativePath:
          'UDB/Estadística Aplicada ESA501 G01T/Desarrollo/Semana 02/Guia 1 - Redes.pdf',
        outcome: null,
      },
    });
    expect((await tasks.all())[0]).toMatchObject({
      originTabId: 5,
      reason: 'nuevo',
      request: { conflictAction: 'uniquify', open: true },
    });
  });

  it('opens an up-to-date file instead of downloading it again', async () => {
    await downloadOnce(message(1));
    backend.opened.length = 0;
    const again = await handleDownloadRequest(message(1), 5, deps);
    expect(again.ok && again.value).toMatchObject({
      status: 'sin_cambios',
      action: 'opened',
      outcome: 'opened',
    });
    expect(backend.opened).toEqual([1]);
    expect(backend.started).toHaveLength(1);
    const quiet = await handleDownloadRequest({ ...message(1), open: false }, 5, deps);
    expect(quiet.ok && quiet.value).toMatchObject({ action: 'skipped', outcome: null });
  });

  it('keeps both copies of a changed file by default, or skips/overwrites per policy', async () => {
    await downloadOnce(message(1));
    const changed = message(1, { size: 20, etag: '"b"' });
    policy = 'omitir';
    const skipped = await handleDownloadRequest(changed, 5, deps);
    // "omitir": nothing is downloaded; the click opens the copy the student already has.
    expect(skipped.ok && skipped.value).toMatchObject({ status: 'actualizado', action: 'opened' });
    expect(backend.started).toHaveLength(1);
    policy = 'conservar_ambas';
    const kept = await handleDownloadRequest(changed, 5, deps);
    expect(kept.ok && kept.value.relativePath).toMatch(/\/Guia 1 - Redes \(rev 2\)\.pdf$/);
    expect((await tasks.all())[0]).toMatchObject({ versions: 2, reason: 'actualizado' });
  });

  it('overwrites in place with "sobrescribir"', async () => {
    await downloadOnce(message(1));
    policy = 'sobrescribir';
    const result = await handleDownloadRequest(message(1, { size: 30 }), 5, deps);
    expect(result.ok && result.value.relativePath).toMatch(/\/Guia 1 - Redes\.pdf$/);
    expect(backend.started.at(-1)?.conflictAction).toBe('overwrite');
  });

  it('downloads again, in place, a file deleted from disk', async () => {
    await downloadOnce(message(1));
    const item = backend.items.get(1);
    if (item === undefined) throw new Error();
    backend.items.set(1, { ...item, exists: false });
    const result = await handleDownloadRequest(message(1), 5, deps);
    expect(result.ok && result.value).toMatchObject({ status: 'perdido_local', action: 'queued' });
    expect(backend.started.at(-1)?.conflictAction).toBe('overwrite');
  });

  it('gives a stable (cmid) suffix when two activities share a name', async () => {
    await downloadOnce(message(1));
    const other = await handleDownloadRequest(message(2), 5, deps);
    expect(other.ok && other.value.relativePath).toMatch(/\/Guia 1 - Redes \(2\)\.pdf$/);
  });

  it('refuses URLs that are not files of this Moodle', async () => {
    for (const url of [
      'https://evil.test/pluginfile.php/1/mod_resource/content/0/a.pdf',
      `${ROOT}mod/resource/view.php?id=1`,
    ]) {
      const result = await handleDownloadRequest(message(1, { url }), 5, deps);
      expect(!result.ok && result.error.code).toBe('not_downloadable');
    }
  });

  it('opens or shows known files from toast buttons', async () => {
    await downloadOnce({ ...message(1), open: false });
    const id = '101:1:mod_resource/content/guia.pdf';
    expect(await openKnownFile(id, 'open', deps)).toEqual({ ok: true, value: 'opened' });
    expect(await openKnownFile(id, 'show', deps)).toEqual({ ok: true, value: 'shown' });
    expect((await openKnownFile('nope', 'open', deps)).ok).toBe(false);
  });
});
