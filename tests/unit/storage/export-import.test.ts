import { describe, expect, it } from 'vitest';
import { SNAPSHOT_VERSION } from '../../../src/core/planning/snapshot-diff';
import type { FileRecord } from '../../../src/storage/db';
import {
  applyBackup,
  BACKUP_FORMAT,
  buildBackup,
  MAX_BACKUP_BYTES,
  parseBackup,
} from '../../../src/storage/export-import';
import { createMemoryFilesRepo } from '../../../src/storage/files-repo';
import { createMemoryMetaRepo } from '../../../src/storage/meta-repo';
import { DEFAULT_SETTINGS, type Settings } from '../../../src/storage/settings-schema';
import { createMemorySnapshotsRepo } from '../../../src/storage/snapshots-repo';

const record = (id: string, relativePath: string): FileRecord => ({
  id,
  courseId: 101,
  cmid: 7,
  fileKey: 'mod_resource/content/a.pdf',
  fingerprint: {
    path: '/pluginfile.php/1/mod_resource/content/0/a.pdf',
    revision: 0,
    size: 10,
    lastModified: null,
    etag: null,
    contentType: 'application/pdf',
  },
  url: 'https://www.udbvirtual.edu.sv/auladigital/pluginfile.php/1/mod_resource/content/0/a.pdf',
  relativePath,
  localPath: 'D:\\UNIVERSIDAD\\UDB\\a.pdf',
  downloadId: 12,
  versions: 1,
  downloadedAt: 5,
});

async function sources() {
  const files = createMemoryFilesRepo();
  const snapshots = createMemorySnapshotsRepo();
  const meta = createMemoryMetaRepo();
  await files.put(record('101:7:a', 'UDB/Curso/Semana 01/a.pdf'));
  await snapshots.put({
    version: SNAPSHOT_VERSION,
    courseId: 101,
    takenAt: 3,
    sections: [{ key: 'n:1', name: 'Semana 1', parent: null, available: true }],
    items: [],
  });
  await meta.putCourse({ id: 101, fullName: 'Curso', shortName: null, lastSeen: 1 });
  const settings: Settings = { ...DEFAULT_SETTINGS, updatePolicy: 'omitir' };
  return { files, snapshots, meta, settings };
}

describe('backup', () => {
  it('round-trips settings, index, snapshots and course names', async () => {
    const backup = await buildBackup(await sources(), '1.0.0', 99);
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, version: 1, exportedAt: 99 });
    const parsed = parseBackup(JSON.stringify(backup));
    if (!parsed.ok) throw new Error(parsed.error.detail);

    const target = {
      files: createMemoryFilesRepo(),
      snapshots: createMemorySnapshotsRepo(),
      meta: createMemoryMetaRepo(),
    };
    let saved: Settings | null = null;
    const summary = await applyBackup(parsed.value, {
      ...target,
      saveSettings: (s) => {
        saved = s;
        return Promise.resolve();
      },
    });
    expect(summary).toEqual({ files: 1, snapshots: 1, courses: 1 });
    expect(saved).toMatchObject({ updatePolicy: 'omitir' });
    // Download ids belong to the other browser: never reused.
    expect(await target.files.get('101:7:a')).toMatchObject({
      relativePath: 'UDB/Curso/Semana 01/a.pdf',
      downloadId: null,
      localPath: null,
    });
    expect((await target.snapshots.get(101))?.takenAt).toBe(3);
    expect(await target.meta.courses()).toHaveLength(1);
  });

  it('rejects files that are not ours, unsafe paths and oversized input', async () => {
    const good = await buildBackup(await sources(), '1.0.0', 1);
    const bad = (change: (b: Record<string, unknown>) => void) => {
      const copy = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
      change(copy);
      return parseBackup(JSON.stringify(copy));
    };
    expect(parseBackup('{').ok).toBe(false);
    expect(parseBackup('x'.repeat(MAX_BACKUP_BYTES + 1)).ok).toBe(false);
    expect(bad((b) => (b.format = 'otro')).ok).toBe(false);
    expect(bad((b) => (b.version = 2)).ok).toBe(false);
    for (const path of ['../../Windows/x.pdf', '/etc/x', 'C:/x.pdf', 'UDB\\x.pdf', 'UDB//x']) {
      const result = bad((b) => {
        for (const f of b.files as { relativePath: string }[]) f.relativePath = path;
      });
      expect(!result.ok && result.error.code).toBe('invalid_backup');
    }
    const foreign = bad((b) => {
      for (const f of b.files as { url: string }[]) f.url = 'https://evil.test/pluginfile.php/1/x';
    });
    expect(foreign.ok).toBe(false);
    // Broken settings fall back to defaults field by field, like stored ones.
    const loose = bad(
      (b) => (b.settings = { updatePolicy: 'borrar_todo', openAfterDownload: false }),
    );
    expect(loose.ok && loose.value.settings).toMatchObject({
      updatePolicy: DEFAULT_SETTINGS.updatePolicy,
      openAfterDownload: false,
    });
  });
});
