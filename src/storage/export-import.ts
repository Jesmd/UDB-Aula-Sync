import * as v from 'valibot';
import { SNAPSHOT_VERSION, type CourseSnapshot } from '../core/planning/snapshot-diff';
import { MOODLE_ROOT_URL } from '../shared/constants';
import { appError, type AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';
import type { FileRecord } from './db';
import type { FilesRepo } from './files-repo';
import type { CourseMeta, MetaRepo } from './meta-repo';
import { normalizeSettings, type Settings } from './settings-schema';
import type { SnapshotsRepo } from './snapshots-repo';

export const BACKUP_FORMAT = 'udb-aula-sync-backup';
export const BACKUP_VERSION = 1;
/** A year of a full course load is a few MB; anything much bigger is not ours. */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

const text = (max: number) => v.pipe(v.string(), v.maxLength(max));
const nullableText = (max: number) => v.nullable(text(max));
const int = (min = 0) => v.pipe(v.number(), v.integer(), v.minValue(min));
/** Relative, "/"-separated, no "..", no drive or leading slash (spec §8: path traversal). */
const safeRelativePath = v.pipe(
  text(400),
  v.check(
    (p) =>
      p.length > 0 &&
      !p.startsWith('/') &&
      !/^[a-zA-Z]:/.test(p) &&
      !p.includes('\\') &&
      p.split('/').every((s) => s !== '' && s !== '.' && s !== '..'),
    'unsafe path',
  ),
);

const FileRecordSchema = v.object({
  id: text(1200),
  courseId: int(1),
  cmid: int(1),
  fileKey: text(1024),
  fingerprint: v.object({
    path: text(2048),
    revision: v.nullable(int()),
    size: v.nullable(int()),
    lastModified: nullableText(100),
    etag: nullableText(200),
    contentType: nullableText(200),
  }),
  url: v.pipe(
    text(2048),
    v.url(),
    v.check((u) => u.startsWith(`${MOODLE_ROOT_URL}pluginfile.php/`), 'not a file of this Moodle'),
  ),
  relativePath: safeRelativePath,
  localPath: nullableText(1000),
  downloadId: v.nullable(int()),
  versions: int(1),
  downloadedAt: int(),
});

const SnapshotSchema = v.object({
  version: v.literal(SNAPSHOT_VERSION),
  courseId: int(1),
  takenAt: int(),
  sections: v.pipe(
    v.array(
      v.object({
        key: text(700),
        name: text(300),
        parent: nullableText(300),
        available: v.boolean(),
      }),
    ),
    v.maxLength(400),
  ),
  items: v.pipe(
    v.array(
      v.object({
        cmid: int(1),
        name: text(300),
        sectionKey: text(700),
        modname: text(40),
        available: v.boolean(),
        downloadable: v.boolean(),
      }),
    ),
    v.maxLength(5000),
  ),
});

const CourseSchema = v.object({
  id: int(1),
  fullName: text(300),
  shortName: nullableText(60),
  lastSeen: int(),
});

const BackupSchema = v.object({
  format: v.literal(BACKUP_FORMAT),
  version: v.literal(BACKUP_VERSION),
  exportedAt: int(),
  extensionVersion: text(20),
  settings: v.unknown(),
  files: v.pipe(v.array(FileRecordSchema), v.maxLength(50_000)),
  snapshots: v.pipe(v.array(SnapshotSchema), v.maxLength(200)),
  courses: v.pipe(v.array(CourseSchema), v.maxLength(500)),
});

export interface Backup {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: typeof BACKUP_VERSION;
  readonly exportedAt: number;
  readonly extensionVersion: string;
  readonly settings: Settings;
  readonly files: readonly FileRecord[];
  readonly snapshots: readonly CourseSnapshot[];
  readonly courses: readonly CourseMeta[];
}

export interface BackupSources {
  readonly settings: Settings;
  readonly files: FilesRepo;
  readonly snapshots: SnapshotsRepo;
  readonly meta: MetaRepo;
}

/**
 * Settings and index for a move to another browser or a reinstall (spec §3.6). Never the
 * queue, the folder permission, the log or anything from the pages themselves.
 */
export async function buildBackup(
  sources: BackupSources,
  extensionVersion: string,
  now: number,
): Promise<Backup> {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    extensionVersion,
    settings: sources.settings,
    files: await sources.files.listAll(),
    snapshots: await sources.snapshots.all(),
    courses: await sources.meta.courses(),
  };
}

/** Validates an untrusted file. Settings are normalized field by field like stored ones. */
export function parseBackup(raw: string): Result<Backup, AppError> {
  if (raw.length > MAX_BACKUP_BYTES) return err(appError('invalid_backup', 'too large'));
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return err(appError('invalid_backup', 'not JSON'));
  }
  const parsed = v.safeParse(BackupSchema, json);
  if (!parsed.success) {
    const issue = parsed.issues[0];
    const path = issue.path?.map((p) => String(p.key)).join('.') ?? '';
    return err(appError('invalid_backup', `${path}: ${issue.message}`));
  }
  return ok({ ...parsed.output, settings: normalizeSettings(parsed.output.settings) });
}

export interface ImportTargets {
  readonly saveSettings: (settings: Settings) => Promise<void>;
  readonly files: FilesRepo;
  readonly snapshots: SnapshotsRepo;
  readonly meta: MetaRepo;
}

export interface ImportSummary {
  readonly files: number;
  readonly snapshots: number;
  readonly courses: number;
}

/**
 * Restores a backup over the current data: settings are replaced; files, snapshots and
 * course names are added or replaced by id. Browser download ids belong to the browser
 * that made them, so they are dropped: an imported file cannot be opened from the
 * extension until it is downloaded again or found by the folder verifier.
 */
export async function applyBackup(backup: Backup, targets: ImportTargets): Promise<ImportSummary> {
  await targets.saveSettings(backup.settings);
  for (const file of backup.files)
    await targets.files.put({ ...file, downloadId: null, localPath: null });
  for (const snapshot of backup.snapshots) await targets.snapshots.put(snapshot);
  for (const course of backup.courses) await targets.meta.putCourse(course);
  return {
    files: backup.files.length,
    snapshots: backup.snapshots.length,
    courses: backup.courses.length,
  };
}
