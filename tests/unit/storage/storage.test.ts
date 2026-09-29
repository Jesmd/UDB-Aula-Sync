import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTask } from '../../../src/core/queue/task';
import { openDatabase, type FileRecord } from '../../../src/storage/db';
import { createFilesRepo } from '../../../src/storage/files-repo';
import { DB_VERSION, MIGRATIONS } from '../../../src/storage/migrations';
import {
  courseSettings,
  DEFAULT_SETTINGS,
  EMPTY_OVERRIDE,
  normalizeSettings,
} from '../../../src/storage/settings-schema';
import { createTasksRepo } from '../../../src/storage/tasks-repo';

beforeEach(() => {
  // A fresh, empty IndexedDB for every test.
  globalThis.indexedDB = new IDBFactory();
});

const record = (id: string, relativePath: string, courseId = 1): FileRecord => ({
  id,
  courseId,
  cmid: 1,
  fileKey: 'k',
  fingerprint: {
    path: '/p',
    revision: 0,
    size: 1,
    lastModified: null,
    etag: null,
    contentType: null,
  },
  url: 'https://x/pluginfile.php/1/a/b/c',
  relativePath,
  localPath: null,
  downloadId: 3,
  versions: 1,
  downloadedAt: 0,
});

describe('database', () => {
  it('creates every store at the current version', async () => {
    const db = await openDatabase('udbsync-test-a');
    expect(db.version).toBe(DB_VERSION);
    expect(DB_VERSION).toBe(MIGRATIONS.length);
    expect([...db.objectStoreNames].sort()).toEqual(['files', 'meta', 'snapshots', 'tasks']);
    db.close();
  });

  it('shares one connection for the default database', async () => {
    const [a, b] = await Promise.all([openDatabase(), openDatabase()]);
    expect(a).toBe(b);
  });
});

describe('repositories', () => {
  it('stores files and finds them by course and by path, ignoring case', async () => {
    const repo = createFilesRepo(await openDatabase('udbsync-test-b'));
    await repo.put(record('a', 'UDB/Curso/Guia.pdf'));
    await repo.put(record('b', 'UDB/Otro/x.pdf', 2));
    expect((await repo.get('a'))?.relativePath).toBe('UDB/Curso/Guia.pdf');
    expect((await repo.listByCourse(2)).map((r) => r.id)).toEqual(['b']);
    expect((await repo.findByPath('udb/curso/GUIA.pdf')).map((r) => r.id)).toEqual(['a']);
    expect(await repo.listAll()).toHaveLength(2);
  });

  it('stores tasks and finds them by download id', async () => {
    const repo = createTasksRepo(await openDatabase('udbsync-test-c'));
    const task = createTask(
      {
        courseId: 1,
        cmid: 2,
        fileKey: 'k',
        request: {
          url: 'u',
          relativePath: 'p',
          conflictAction: 'uniquify',
          extension: '',
          expectedSize: null,
          expectedType: null,
          open: false,
        },
        fingerprint: record('a', 'p').fingerprint,
        reason: 'nuevo',
        versions: 1,
        originTabId: null,
      },
      0,
    );
    await repo.put({ ...task, downloadId: 9 });
    expect((await repo.findByDownloadId(9))?.id).toBe(task.id);
    expect(await repo.findByDownloadId(8)).toBeUndefined();
    await repo.remove(task.id);
    expect(await repo.all()).toEqual([]);
  });
});

describe('settings', () => {
  it('returns defaults for nothing stored', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.updatePolicy).toBe('conservar_ambas');
  });

  it('keeps valid fields and replaces broken ones one by one', () => {
    const result = normalizeSettings({
      version: 1,
      paths: {
        ...DEFAULT_SETTINGS.paths,
        base: 'Universidad',
        template: '{base}/../{archivo}',
        padNumbers: 'yes',
      },
      updatePolicy: 'sobrescribir',
      openAfterDownload: false,
      interceptClicks: 'maybe',
    });
    expect(result.paths).toEqual({ ...DEFAULT_SETTINGS.paths, base: 'Universidad' });
    expect(result).toMatchObject({
      updatePolicy: 'sobrescribir',
      openAfterDownload: false,
      interceptClicks: true,
    });
    expect(normalizeSettings({ paths: 'x', updatePolicy: 'borrar_todo' })).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('migrates v1 data to v2 with defaults for the new fields', () => {
    const v1 = { ...DEFAULT_SETTINGS, version: 1, updatePolicy: 'omitir' } as Record<
      string,
      unknown
    >;
    const dropped = new Set([
      'hoverDetails',
      'showStatusBadges',
      'filters',
      'syncIntervalHours',
      'courses',
    ]);
    for (const key of dropped) Reflect.deleteProperty(v1, key);
    expect(normalizeSettings(v1)).toEqual({ ...DEFAULT_SETTINGS, updatePolicy: 'omitir' });
  });

  it('validates filters and per-course overrides field by field', () => {
    const result = normalizeSettings({
      ...DEFAULT_SETTINGS,
      filters: { excludedExtensions: ['.ZIP', 'pkt'], maxSizeMb: 50 },
      courses: {
        '101': {
          template: '{base}/{curso}/{archivo}',
          skipSections: ['Recursos Bibliográficos'],
          excludedExtensions: null,
          maxSizeMb: 0,
          autoDownload: true,
        },
        abc: { template: null },
        '102': 'broken',
      },
    });
    expect(result.filters).toEqual({ excludedExtensions: ['zip', 'pkt'], maxSizeMb: 50 });
    expect(Object.keys(result.courses)).toEqual(['101', '102']);
    expect(result.courses['101']).toEqual({
      template: '{base}/{curso}/{archivo}',
      skipSections: ['Recursos Bibliográficos'],
      excludedExtensions: null,
      maxSizeMb: null,
      autoDownload: true,
    });
    expect(result.courses['102']).toEqual(EMPTY_OVERRIDE);
  });

  it('applies course overrides over the global settings', () => {
    const settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      filters: { excludedExtensions: ['zip'], maxSizeMb: 10 },
      courses: { '7': { ...EMPTY_OVERRIDE, template: '{curso}/{archivo}', maxSizeMb: 99 } },
    });
    expect(courseSettings(settings, 7)).toMatchObject({
      paths: { template: '{curso}/{archivo}', base: 'UDB' },
      filters: { excludedExtensions: ['zip'], maxSizeMb: 99 },
    });
    expect(courseSettings(settings, 8)).toMatchObject({
      paths: DEFAULT_SETTINGS.paths,
      filters: settings.filters,
      override: EMPTY_OVERRIDE,
    });
  });
});
