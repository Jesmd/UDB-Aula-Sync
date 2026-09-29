import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseSync, type CourseSyncDeps } from '../../../src/background/course-sync';
import { badgeText } from '../../../src/background/badge';
import { noveltySummary } from '../../../src/background/notifications';
import { politeFetch } from '../../../src/core/http/polite-fetch';
import { createRateLimiter } from '../../../src/core/http/rate-limiter';
import {
  SNAPSHOT_VERSION,
  type CourseSnapshot,
  type SnapshotItem,
} from '../../../src/core/planning/snapshot-diff';
import { syncCourse } from '../../../src/moodle/course-sync';
import { appError } from '../../../src/shared/errors';
import { createLogger } from '../../../src/shared/logger';
import type { CourseSyncResult, DownloadPayload } from '../../../src/shared/messages';
import { err, ok } from '../../../src/shared/result';
import { createMemoryFilesRepo } from '../../../src/storage/files-repo';
import { createMemoryMetaRepo } from '../../../src/storage/meta-repo';
import {
  DEFAULT_SETTINGS,
  EMPTY_OVERRIDE,
  type Settings,
} from '../../../src/storage/settings-schema';
import {
  createMemorySnapshotsRepo,
  createNoveltiesRepo,
} from '../../../src/storage/snapshots-repo';
import { jsdomParser } from '../../helpers/html-parser';
import { startMockMoodle, type MockMoodle } from '../../mock-moodle/server';

const ROOT = 'https://www.udbvirtual.edu.sv/auladigital/';

const item = (cmid: number, available = true): SnapshotItem => ({
  cmid,
  name: `Archivo ${cmid}`,
  sectionKey: 'n:1',
  modname: 'resource',
  available,
  downloadable: true,
});
const snapshot = (courseId: number, items: SnapshotItem[], takenAt = 0): CourseSnapshot => ({
  version: SNAPSHOT_VERSION,
  courseId,
  takenAt,
  sections: [{ key: 'n:1', name: 'Semana 1', parent: null, available: true }],
  items,
});
const payload = (courseId: number, cmid: number) =>
  ({ courseId, cmid, file: { originalName: `${cmid}.pdf` } }) as unknown as DownloadPayload;

function setup() {
  const meta = createMemoryMetaRepo();
  const snapshots = createMemorySnapshotsRepo();
  const novelties = createNoveltiesRepo(meta);
  const files = createMemoryFilesRepo();
  let settings: Settings = DEFAULT_SETTINGS;
  const results = new Map<number, CourseSyncResult>();
  const deps = {
    snapshots,
    novelties,
    files,
    meta,
    settings: () => Promise.resolve(settings),
    scan: vi.fn<CourseSyncDeps['scan']>((courseId) => {
      const r = results.get(courseId);
      return Promise.resolve(r === undefined ? err(appError('network', 'x')) : ok(r));
    }),
    download: vi.fn<CourseSyncDeps['download']>(() => Promise.resolve(true)),
    online: vi.fn<() => boolean>(() => true),
    screenLocked: vi.fn<() => Promise<boolean>>(() => Promise.resolve(false)),
    busy: vi.fn<() => Promise<boolean>>(() => Promise.resolve(false)),
    badge: vi.fn<(n: number) => void>(),
    notifyNovelties: vi.fn(),
    notifySessionLost: vi.fn(),
    log: createLogger('test'),
    now: () => 100,
  } satisfies CourseSyncDeps;
  return {
    deps,
    sync: new CourseSync(deps),
    results,
    setSettings: (s: Settings) => {
      settings = s;
    },
  };
}

describe('CourseSync', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('never syncs a course that was not synced by hand first', async () => {
    expect(await t.sync.run('alarm')).toMatchObject({ skipped: 'no_courses' });
    expect(t.deps.scan).not.toHaveBeenCalled();
  });

  it('records novelties, updates the badge and sends one grouped notification', async () => {
    await t.sync.saveSnapshot(snapshot(1, [item(10), item(11, false)]));
    await t.deps.meta.putCourse({ id: 1, fullName: 'Redes', shortName: null, lastSeen: 0 });
    t.results.set(1, {
      snapshot: snapshot(1, [item(10), item(11), item(12)], 100),
      files: [payload(1, 11), payload(1, 12)],
      readOnly: [],
      failed: 0,
    });
    const summary = await t.sync.run('alarm');
    expect(summary).toMatchObject({ courses: 1, novelties: 2, queued: 0, skipped: null });
    // Only what the snapshot could open is "known": 11 was restricted.
    expect(t.deps.scan).toHaveBeenCalledWith(1, [10], []);
    expect((await t.deps.novelties.get(1)).map((n) => n.kind === 'item' && n.cmid)).toEqual([
      11, 12,
    ]);
    expect(t.deps.badge).toHaveBeenLastCalledWith(2);
    expect(t.deps.notifyNovelties).toHaveBeenCalledWith([{ courseId: 1, name: 'Redes', count: 2 }]);
    expect(await t.deps.snapshots.get(1)).toMatchObject({ takenAt: 100 });
    expect(t.deps.download).not.toHaveBeenCalled();

    // Same state next time: nothing new, no second notification.
    await t.sync.run('alarm');
    expect(t.deps.notifyNovelties).toHaveBeenCalledTimes(1);

    await t.sync.downloaded(1, 11);
    expect(t.deps.badge).toHaveBeenLastCalledWith(1);
    await t.sync.clear(null);
    expect(t.deps.badge).toHaveBeenLastCalledWith(0);
  });

  it('downloads novelties automatically only where the course asks for it', async () => {
    t.setSettings({
      ...DEFAULT_SETTINGS,
      courses: { '1': { ...EMPTY_OVERRIDE, autoDownload: true, skipSections: ['Foro'] } },
    });
    await t.sync.saveSnapshot(snapshot(1, [item(10)]));
    await t.sync.saveSnapshot(snapshot(2, [item(20)]));
    t.results.set(1, {
      snapshot: snapshot(1, [item(10), item(12)]),
      files: [payload(1, 12), payload(1, 12)],
      readOnly: [],
      failed: 0,
    });
    t.results.set(2, {
      snapshot: snapshot(2, [item(20), item(21)]),
      files: [payload(2, 21)],
      readOnly: [],
      failed: 0,
    });
    const summary = await t.sync.run('manual');
    expect(summary).toMatchObject({ courses: 2, novelties: 2, queued: 2 });
    expect(t.deps.scan).toHaveBeenCalledWith(1, [10], ['Foro']);
    expect(t.deps.download.mock.calls.map(([p]) => p.cmid)).toEqual([12, 12]);
  });

  it('skips files already in the index', async () => {
    await t.sync.saveSnapshot(snapshot(1, [item(10)]));
    await t.deps.files.put({
      id: '1:12:k',
      courseId: 1,
      cmid: 12,
      fileKey: 'k',
      fingerprint: {
        path: '/p',
        revision: 0,
        size: 1,
        lastModified: null,
        etag: null,
        contentType: null,
      },
      url: 'u',
      relativePath: 'p',
      localPath: null,
      downloadId: 1,
      versions: 1,
      downloadedAt: 1,
    });
    t.results.set(1, {
      snapshot: snapshot(1, [item(10), item(12)]),
      files: [],
      readOnly: [],
      failed: 0,
    });
    expect(await t.sync.run('alarm')).toMatchObject({ novelties: 0 });
    expect(t.deps.notifyNovelties).not.toHaveBeenCalled();
  });

  it('a lost session stops the run, notifies once and holds background runs', async () => {
    await t.sync.saveSnapshot(snapshot(1, [item(10)]));
    await t.sync.saveSnapshot(snapshot(2, [item(20)]));
    t.deps.scan.mockImplementation(() =>
      Promise.resolve(err(appError('session_expired', 'login'))),
    );
    expect(await t.sync.run('alarm')).toMatchObject({ errorCode: 'session_expired', courses: 0 });
    expect(t.deps.scan).toHaveBeenCalledTimes(1);
    expect(t.deps.notifySessionLost).toHaveBeenCalledTimes(1);
    expect((await t.sync.status()).sessionLost).toBe(true);

    // Zero requests while the session is lost; the queue losing it too does not re-notify.
    expect(await t.sync.run('alarm')).toMatchObject({ skipped: 'session_lost' });
    await t.sync.sessionLost();
    expect(t.deps.scan).toHaveBeenCalledTimes(1);
    expect(t.deps.notifySessionLost).toHaveBeenCalledTimes(1);

    await t.sync.sessionAlive();
    expect((await t.sync.status()).sessionLost).toBe(false);
    await t.sync.run('alarm');
    expect(t.deps.scan).toHaveBeenCalledTimes(2);
  });

  it('puts off runs without network or with the screen locked, and resumes them', async () => {
    await t.sync.saveSnapshot(snapshot(1, [item(10)]));
    t.results.set(1, { snapshot: snapshot(1, [item(10)]), files: [], readOnly: [], failed: 0 });
    t.deps.online.mockReturnValue(false);
    expect(await t.sync.run('alarm')).toMatchObject({ skipped: 'offline' });
    t.deps.online.mockReturnValue(true);
    t.deps.screenLocked.mockResolvedValue(true);
    expect(await t.sync.run('alarm')).toMatchObject({ skipped: 'locked' });
    t.deps.busy.mockResolvedValueOnce(true);
    t.deps.screenLocked.mockResolvedValueOnce(false);
    expect(await t.sync.run('alarm')).toMatchObject({ skipped: 'busy' });
    // A manual run ignores the lock (the user is there).
    expect(await t.sync.run('manual')).toMatchObject({ skipped: null });
    expect(await t.sync.resumePending()).toBeNull();

    await t.sync.run('alarm');
    t.deps.screenLocked.mockResolvedValue(false);
    expect(await t.sync.resumePending()).toMatchObject({ skipped: null, courses: 1 });
    expect(t.deps.scan).toHaveBeenCalledTimes(2);
  });

  it('refuses a second run while one is going', async () => {
    await t.sync.saveSnapshot(snapshot(1, [item(10)]));
    let release: () => void = () => undefined;
    t.deps.scan.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(ok({ snapshot: snapshot(1, [item(10)]), files: [], readOnly: [], failed: 0 }));
          };
        }),
    );
    const first = t.sync.run('manual');
    await vi.waitFor(() => {
      expect(t.deps.scan).toHaveBeenCalled();
    });
    expect(t.sync.running).toBe(true);
    expect(await t.sync.run('manual')).toMatchObject({ skipped: 'running' });
    release();
    await first;
    expect(t.sync.running).toBe(false);
  });
});

describe('badge and notification text', () => {
  it('formats the counter and groups courses', () => {
    expect([0, 5, 150].map(badgeText)).toEqual(['', '5', '99+']);
    const notices = [1, 2, 3, 4, 5].map((i) => ({ courseId: i, name: `C${i}`, count: i }));
    expect(noveltySummary(notices)).toBe('C5: 5 · C4: 4 · C3: 3 · C2: 2 · +1');
  });
});

describe('syncCourse against the mock server', () => {
  let mock: MockMoodle;
  const requests = () => mock.state.requests.filter((r) => !r.includes('/__test/'));
  beforeAll(async () => {
    mock = await startMockMoodle({ port: 0, tls: false });
  });
  afterAll(async () => {
    await mock.close();
  });
  const deps = () => ({
    fetch: politeFetch((input, init) => fetch(input.replace(ROOT, mock.root), init), {
      limiter: createRateLimiter({ maxConcurrent: 2, minDelayMs: 0, maxDelayMs: 0 }),
    }),
    parseHtml: jsdomParser,
    moodleRoot: ROOT,
    now: () => 7,
  });

  it('snapshots the course and resolves only unknown downloadable items', async () => {
    mock.state.requests.length = 0;
    const result = await syncCourse(103, new Set([4002, 4101, 4102, 4202]), [], deps());
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.snapshot).toMatchObject({ courseId: 103, takenAt: 7 });
    expect(result.value.snapshot.items.map((i) => i.cmid)).toContain(4302);
    expect(result.value.files.map((f) => [f.cmid, f.file.originalName])).toEqual([
      [4201, 'Topologia_Jerarquica_Guia2.pdf'],
    ]);
    expect(result.value.readOnly).toEqual([4301]);
    expect(result.value.files[0]).toMatchObject({ open: false, section: { name: 'Tema 2' } });
    // Only the course page and the two unknown items were requested.
    expect(requests().filter((r) => r.includes('view.php')).length).toBe(3);
  });

  it('sees a new resource and an opened section on the page', async () => {
    mock.state.pageEdits.set(103, {
      activities: [{ section: 5, cmid: 4501, name: 'Guía 5: <nueva>' }],
      revealed: [12],
    });
    const seed = mock.state.resources.get(4002);
    if (seed === undefined) throw new Error('seed 4002');
    mock.state.resources.set(4501, { ...seed, cmid: 4501 });
    const result = await syncCourse(103, new Set([4002, 4101, 4102, 4201, 4202]), [], deps());
    mock.state.pageEdits.clear();
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.files.map((f) => [f.cmid, f.activityName])).toEqual([
      [4501, 'Guía 5: <nueva>'],
    ]);
    expect(result.value.snapshot.sections.find((s) => s.key === 'n:12')?.available).toBe(true);
  });

  it('stops after one request when the session is lost', async () => {
    mock.state.requests.length = 0;
    mock.state.loggedIn = false;
    const result = await syncCourse(103, new Set(), [], deps());
    mock.state.loggedIn = true;
    expect(!result.ok && result.error.code).toBe('session_expired');
    expect(requests().filter((r) => !r.includes('login'))).toHaveLength(1);
  });
});
