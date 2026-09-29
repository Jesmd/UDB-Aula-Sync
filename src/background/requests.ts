import { parsePluginfileUrl } from '../core/http/pluginfile-url';
import { buildPath, withVersionSuffix, type PathInput } from '../core/paths/build-path';
import { fingerprintOf } from '../core/planning/fingerprint';
import { reconcile } from '../core/planning/reconcile';
import { taskId } from '../core/queue/task';
import { MOODLE_ROOT_URL } from '../shared/constants';
import { appError, type AppError } from '../shared/errors';
import type { DownloadRequestMessage, DownloadRequestResponse } from '../shared/messages';
import { err, ok, type Result } from '../shared/result';
import type { FilesRepo } from '../storage/files-repo';
import type { Settings } from '../storage/settings-schema';
import type { DownloadBackend } from './download-manager';
import { safeOpen } from './safe-open';
import type { DownloadQueue } from './sync-engine';

export interface RequestDeps {
  readonly files: FilesRepo;
  readonly backend: DownloadBackend;
  readonly queue: DownloadQueue;
  readonly settings: () => Promise<Settings>;
  /** Download files only from the Moodle this build targets. */
  readonly moodleRoot?: string;
}

/** Relative path for a new file; adds " (cmid)" when another file already owns the path. */
async function freshPath(
  message: DownloadRequestMessage,
  settings: Settings,
  files: FilesRepo,
  id: string,
) {
  const input: PathInput = {
    course: message.course,
    section: message.section,
    activity: { cmid: message.cmid, name: message.activityName },
    file: { originalName: message.file.originalName, extension: message.file.extension },
  };
  const first = buildPath(input, settings.paths);
  if (!first.ok) return first;
  const owners = await files.findByPath(first.value.relativePath);
  if (owners.every((r) => r.id === id)) return first;
  return buildPath({ ...input, collision: true }, settings.paths);
}

/**
 * A click on a resolved file: compare with the index and the local copy, then open what
 * is already here or queue the download. Runs inside the click's user gesture, so
 * opening an up-to-date file works directly (ADR-004).
 */
export async function handleDownloadRequest(
  message: DownloadRequestMessage,
  originTabId: number | null,
  deps: RequestDeps,
): Promise<Result<DownloadRequestResponse, AppError>> {
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

  if (decision.action === 'skip') {
    const openId = message.open && localExists !== false ? (existing?.downloadId ?? null) : null;
    const outcome =
      openId === null ? null : await safeOpen(deps.backend, openId, message.file.extension);
    return ok({
      status: decision.status,
      action: outcome === null ? 'skipped' : 'opened',
      fileId: id,
      relativePath: existing?.relativePath ?? null,
      outcome,
    });
  }

  let relativePath: string;
  if (existing !== undefined && decision.versionSuffix === null) {
    // Same file again (lost locally or overwritten): keep its place.
    relativePath = existing.relativePath;
  } else {
    const built = await freshPath(message, settings, deps.files, id);
    if (!built.ok) return built;
    relativePath =
      decision.versionSuffix === null
        ? built.value.relativePath
        : withVersionSuffix(built.value.relativePath, decision.versionSuffix);
  }

  await deps.queue.enqueue({
    courseId: message.courseId,
    cmid: message.cmid,
    fileKey: ref.fileKey,
    request: {
      url: message.file.url,
      relativePath,
      conflictAction: decision.conflictAction,
      extension: message.file.extension,
      expectedSize: message.file.size,
      expectedType: message.file.contentType,
      open: message.open,
    },
    fingerprint,
    reason: decision.status,
    versions:
      existing === undefined
        ? 1
        : decision.versionSuffix === null
          ? existing.versions
          : existing.versions + 1,
    originTabId,
  });
  return ok({ status: decision.status, action: 'queued', fileId: id, relativePath, outcome: null });
}

/** Open or show a file the index knows, from a toast button (fresh user gesture). */
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
  const extension = record.relativePath.split('.').pop() ?? '';
  return ok(
    await safeOpen(
      deps.backend,
      record.downloadId,
      record.relativePath.includes('.') ? extension : '',
    ),
  );
}
