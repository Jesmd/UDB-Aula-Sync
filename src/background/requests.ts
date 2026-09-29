import { parsePluginfileUrl, type PluginfileRef } from '../core/http/pluginfile-url';
import {
  buildPath,
  withVersionSuffix,
  type PathInput,
  type PathSettings,
} from '../core/paths/build-path';
import { filterReason } from '../core/planning/filters';
import { fingerprintOf, type Fingerprint } from '../core/planning/fingerprint';
import { reconcile, type Decision } from '../core/planning/reconcile';
import { taskId } from '../core/queue/task';
import { MOODLE_ROOT_URL } from '../shared/constants';
import { appError, type AppError } from '../shared/errors';
import type {
  DownloadPreviewResponse,
  DownloadPayload,
  DownloadRequestResponse,
  FileStatusEntry,
} from '../shared/messages';
import { err, ok, type Result } from '../shared/result';
import type { FileRecord } from '../storage/db';
import type { FilesRepo } from '../storage/files-repo';
import type { MetaRepo } from '../storage/meta-repo';
import { courseSettings, type Settings } from '../storage/settings-schema';
import type { DownloadBackend } from './download-manager';
import { safeOpen } from './safe-open';
import type { DownloadQueue } from './sync-engine';

export interface RequestDeps {
  readonly files: FilesRepo;
  readonly backend: DownloadBackend;
  readonly queue: DownloadQueue;
  readonly settings: () => Promise<Settings>;
  /** Remembers course names for the popup; optional in tests. */
  readonly meta?: MetaRepo;
  /** Download files only from the Moodle this build targets. */
  readonly moodleRoot?: string;
  readonly now?: () => number;
}

/** Relative path for a new file; adds " (cmid)" when another file already owns the path. */
async function freshPath(
  message: DownloadPayload,
  paths: PathSettings,
  files: FilesRepo,
  id: string,
) {
  const input: PathInput = {
    course: message.course,
    section: message.section,
    activity: { cmid: message.cmid, name: message.activityName },
    file: {
      originalName: message.file.originalName,
      extension: message.file.extension,
      ...(message.folderPath === null ? {} : { folderPath: message.folderPath }),
    },
  };
  const first = buildPath(input, paths);
  if (!first.ok) return first;
  const owners = await files.findByPath(first.value.relativePath);
  if (owners.every((r) => r.id === id)) return first;
  return buildPath({ ...input, collision: true }, paths);
}

interface Assessment {
  readonly id: string;
  readonly ref: PluginfileRef;
  readonly fingerprint: Fingerprint;
  readonly existing: FileRecord | undefined;
  readonly localExists: boolean | null;
  readonly decision: Decision;
  readonly settings: Settings;
}

/** Compares the file with the index and the local copy under the user's update policy. */
async function assess(
  message: DownloadPayload,
  deps: RequestDeps,
): Promise<Result<Assessment, AppError>> {
  const ref = parsePluginfileUrl(message.file.url);
  if (ref === null || !message.file.url.startsWith(deps.moodleRoot ?? MOODLE_ROOT_URL)) {
    return err(appError('not_downloadable', 'not a pluginfile URL of this Moodle'));
  }
  const settings = await deps.settings();
  const id = taskId(message.courseId, message.cmid, ref.fileKey);
  const fingerprint = fingerprintOf({ ...message.file, ref });
  const existing = await deps.files.get(id);
  const local = existing?.downloadId == null ? null : await deps.backend.get(existing.downloadId);
  const localExists = existing === undefined ? null : local === null ? null : local.exists;
  const decision = reconcile(
    existing === undefined
      ? null
      : { fingerprint: existing.fingerprint, versions: existing.versions },
    fingerprint,
    localExists,
    settings.updatePolicy,
  );
  return ok({ id, ref, fingerprint, existing, localExists, decision, settings });
}

async function targetPath(
  message: DownloadPayload,
  a: Assessment,
  files: FilesRepo,
): Promise<Result<string, AppError>> {
  if (a.decision.action === 'skip') return ok(a.existing?.relativePath ?? '');
  if (a.existing !== undefined && a.decision.versionSuffix === null) {
    // Same file again (lost locally or overwritten): keep its place.
    return ok(a.existing.relativePath);
  }
  const built = await freshPath(
    message,
    courseSettings(a.settings, message.courseId).paths,
    files,
    a.id,
  );
  if (!built.ok) return built;
  return ok(
    a.decision.versionSuffix === null
      ? built.value.relativePath
      : withVersionSuffix(built.value.relativePath, a.decision.versionSuffix),
  );
}

async function rememberCourse(message: DownloadPayload, deps: RequestDeps): Promise<void> {
  await deps.meta?.putCourse({
    id: message.courseId,
    fullName: message.course.fullName,
    shortName: message.course.shortName,
    lastSeen: (deps.now ?? Date.now)(),
  });
}

/**
 * Dry run for the plan (spec §3.3): what a download would do, without doing it. Bulk
 * filters (extensions, size) apply here; a click on a single file ignores them.
 */
export async function previewDownload(
  message: DownloadPayload,
  deps: RequestDeps,
): Promise<Result<DownloadPreviewResponse, AppError>> {
  const assessed = await assess(message, deps);
  if (!assessed.ok) return assessed;
  const a = assessed.value;
  const path = await targetPath(message, a, deps.files);
  if (!path.ok) return path;
  const omitted = filterReason(message.file, courseSettings(a.settings, message.courseId).filters);
  return ok({
    fileId: a.id,
    status: omitted === null ? a.decision.status : 'omitido',
    willDownload: omitted === null && a.decision.action === 'download',
    relativePath: path.value,
    size: message.file.size,
    omitted,
  });
}

/**
 * A request to download one file (a click, or one item of a confirmed plan): open what
 * is already here and up to date, or queue the download. Inside a click, opening an
 * up-to-date file may work directly; otherwise the toast offers "Abrir" (ADR-016).
 */
export async function handleDownloadRequest(
  message: DownloadPayload,
  originTabId: number | null,
  deps: RequestDeps,
): Promise<Result<DownloadRequestResponse, AppError>> {
  const assessed = await assess(message, deps);
  if (!assessed.ok) return assessed;
  const a = assessed.value;
  await rememberCourse(message, deps);

  if (a.decision.action === 'skip') {
    const openId =
      message.open && a.localExists !== false ? (a.existing?.downloadId ?? null) : null;
    const outcome =
      openId === null ? null : await safeOpen(deps.backend, openId, message.file.extension);
    return ok({
      status: a.decision.status,
      action: outcome === null ? 'skipped' : 'opened',
      fileId: a.id,
      relativePath: a.existing?.relativePath ?? null,
      outcome,
    });
  }

  const path = await targetPath(message, a, deps.files);
  if (!path.ok) return path;
  const { decision, existing } = a;
  await deps.queue.enqueue({
    courseId: message.courseId,
    cmid: message.cmid,
    fileKey: a.ref.fileKey,
    request: {
      url: message.file.url,
      relativePath: path.value,
      conflictAction: decision.conflictAction,
      extension: message.file.extension,
      expectedSize: message.file.size,
      expectedType: message.file.contentType,
      open: message.open,
    },
    fingerprint: a.fingerprint,
    reason: decision.status,
    versions:
      existing === undefined
        ? 1
        : decision.versionSuffix === null
          ? existing.versions
          : existing.versions + 1,
    originTabId,
  });
  return ok({
    status: decision.status,
    action: 'queued',
    fileId: a.id,
    relativePath: path.value,
    outcome: null,
  });
}

/** Index state of a course's files for the page badges; local presence checked with the browser. */
export async function courseFileStatuses(
  courseId: number,
  deps: Pick<RequestDeps, 'files' | 'backend'>,
): Promise<FileStatusEntry[]> {
  const records = await deps.files.listByCourse(courseId);
  return Promise.all(
    records.map(async (r) => {
      const local = r.downloadId === null ? null : await deps.backend.get(r.downloadId);
      return {
        fileId: r.id,
        cmid: r.cmid,
        relativePath: r.relativePath,
        downloadedAt: r.downloadedAt,
        localExists: local === null ? null : local.exists,
      };
    }),
  );
}

/** Open or show a file the index knows (popup or framed buttons: fresh user gesture). */
export async function openKnownFile(
  fileId: string,
  mode: 'open' | 'show',
  deps: Pick<RequestDeps, 'files' | 'backend'>,
): Promise<Result<'opened' | 'shown' | 'blocked', AppError>> {
  const record = await deps.files.get(fileId);
  if (record?.downloadId == null) return err(appError('not_downloadable', 'file not in the index'));
  if (mode === 'show') {
    const shown = await deps.backend.show(record.downloadId);
    return shown.ok ? ok('shown') : err(shown.error);
  }
  const name = record.relativePath.split('/').pop() ?? '';
  return ok(
    await safeOpen(
      deps.backend,
      record.downloadId,
      name.includes('.') ? (name.split('.').pop() ?? '') : '',
    ),
  );
}
