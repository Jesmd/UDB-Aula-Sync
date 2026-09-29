import * as v from 'valibot';
import type { DiagnosticReport } from '../moodle/diagnostic';
import type { HypothesisReport } from '../moodle/hypotheses';
import type { Task } from '../core/queue/task';
import type { CourseSnapshot, Novelty } from '../core/planning/snapshot-diff';
import type { FileRecord } from '../storage/db';
import type { CourseMeta } from '../storage/meta-repo';
import type { FileStatus } from './types';
import { appError, type AppError } from './errors';
import { err, ok, type Result } from './result';

/**
 * Every runtime message is validated on receipt. Senders use the inferred types;
 * receivers call parseMessage() and never trust the raw value.
 */

const text = (max: number) => v.pipe(v.string(), v.maxLength(max));
const nullableText = (max: number) => v.nullable(text(max));
const positiveInt = v.pipe(v.number(), v.integer(), v.minValue(1));
const httpUrl = v.pipe(v.string(), v.url(), v.maxLength(2048));
const fileId = text(1200);

/** A file resolved by the content script, as sent to the worker. */
const ResolvedFilePayload = v.object({
  url: httpUrl,
  fileKey: text(1024),
  path: text(2048),
  revision: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  originalName: text(300),
  extension: text(10),
  size: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  lastModified: nullableText(100),
  etag: nullableText(200),
  contentType: nullableText(200),
});

const downloadEntries = {
  target: v.literal('background'),
  courseId: positiveInt,
  cmid: positiveInt,
  course: v.object({ fullName: text(300), shortName: nullableText(60) }),
  section: v.object({
    name: text(300),
    parent: nullableText(300),
    position: positiveInt,
    numberWidth: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4)),
  }),
  activityName: text(300),
  file: ResolvedFilePayload,
  /** mod_folder: subfolders inside the folder; null for a resource. */
  folderPath: v.nullable(v.pipe(v.array(text(200)), v.maxLength(20))),
  open: v.boolean(),
};

const DownloadRequestMessage = v.object({
  ...downloadEntries,
  type: v.literal('download/request'),
});
/** Same payload, dry run: the plan (spec §3.3). */
const DownloadPreviewMessage = v.object({
  ...downloadEntries,
  type: v.literal('download/preview'),
});

const SnapshotSchema = v.object({
  version: v.literal(1),
  courseId: positiveInt,
  takenAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
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
    v.readonly(),
  ),
  items: v.pipe(
    v.array(
      v.object({
        cmid: positiveInt,
        name: text(300),
        sectionKey: text(700),
        modname: text(40),
        available: v.boolean(),
        downloadable: v.boolean(),
      }),
    ),
    v.maxLength(5000),
    v.readonly(),
  ),
});

const BackgroundRequest = v.variant('type', [
  v.object({ target: v.literal('background'), type: v.literal('ping') }),
  DownloadRequestMessage,
  DownloadPreviewMessage,
  v.object({ target: v.literal('background'), type: v.literal('download/open'), fileId }),
  v.object({
    target: v.literal('background'),
    type: v.literal('files/status'),
    courseId: positiveInt,
  }),
  v.object({
    target: v.literal('background'),
    type: v.literal('queue/control'),
    action: v.picklist(['pause', 'resume', 'cancel']),
  }),
  v.object({ target: v.literal('background'), type: v.literal('download/show'), fileId }),
  v.object({ target: v.literal('background'), type: v.literal('queue/list') }),
  v.object({ target: v.literal('background'), type: v.literal('files/get'), fileId }),
  v.object({ target: v.literal('background'), type: v.literal('queue/retry-failed') }),
  v.object({
    target: v.literal('background'),
    type: v.literal('content/hello'),
    url: v.pipe(v.string(), v.url(), v.maxLength(2048)),
  }),
  v.object({ target: v.literal('background'), type: v.literal('logs/export') }),
  v.object({ target: v.literal('background'), type: v.literal('spike/offscreen') }),
  v.object({
    target: v.literal('background'),
    type: v.literal('spike/open-via-worker'),
    downloadId: v.pipe(v.number(), v.integer(), v.minValue(0)),
  }),
  v.object({ target: v.literal('background'), type: v.literal('spike/fetch-worker') }),
  v.object({ target: v.literal('background'), type: v.literal('spike/fetch-offscreen') }),
  /** A full course scan from the page: the manual first sync (spec §2) or a refresh. */
  v.object({
    target: v.literal('background'),
    type: v.literal('snapshot/save'),
    snapshot: SnapshotSchema,
  }),
  /** "Sincronizar ahora" (popup). */
  v.object({ target: v.literal('background'), type: v.literal('sync/run') }),
  v.object({
    target: v.literal('background'),
    type: v.literal('novelties/clear'),
    courseId: v.nullable(positiveInt),
  }),
]);

const OffscreenRequest = v.variant('type', [
  v.object({ target: v.literal('offscreen'), type: v.literal('offscreen/ping') }),
  v.object({
    target: v.literal('offscreen'),
    type: v.literal('offscreen/fetch-probe'),
    url: v.pipe(v.string(), v.url(), v.maxLength(2048)),
  }),
  /** Scan one course in the background and resolve its downloadable items not in `known`. */
  v.object({
    target: v.literal('offscreen'),
    type: v.literal('offscreen/sync-course'),
    courseId: positiveInt,
    known: v.pipe(v.array(positiveInt), v.maxLength(5000)),
    skipSections: v.pipe(v.array(text(120)), v.maxLength(60)),
  }),
]);

const ContentRequest = v.variant('type', [
  v.object({ target: v.literal('content'), type: v.literal('content/diagnose') }),
  v.object({ target: v.literal('content'), type: v.literal('content/test-hypotheses') }),
  /** Worker -> tab that asked for a download: progress and outcome. */
  v.object({
    target: v.literal('content'),
    type: v.literal('content/download-update'),
    event: v.picklist(['task', 'opened', 'session_expired', 'save_dialog']),
    fileId: v.nullable(fileId),
    cmid: v.nullable(positiveInt),
    state: v.nullable(
      v.picklist([
        'en_cola',
        'resolviendo',
        'descargando',
        'verificando',
        'hecha',
        'fallida',
        'omitida',
      ]),
    ),
    relativePath: nullableText(400),
    outcome: v.nullable(v.picklist(['opened', 'shown', 'blocked'])),
    errorCode: nullableText(60),
  }),
]);

export const RuntimeMessage = v.union([BackgroundRequest, OffscreenRequest, ContentRequest]);

export type BackgroundRequest = v.InferOutput<typeof BackgroundRequest>;
export type OffscreenRequest = v.InferOutput<typeof OffscreenRequest>;
export type ContentRequest = v.InferOutput<typeof ContentRequest>;
export type DownloadRequestMessage = v.InferOutput<typeof DownloadRequestMessage>;
export type DownloadPreviewMessage = v.InferOutput<typeof DownloadPreviewMessage>;
/** Fields shared by download requests and previews. */
export type DownloadPayload = Omit<DownloadRequestMessage, 'type'>;
export type DownloadUpdateMessage = Extract<ContentRequest, { type: 'content/download-update' }>;
export type RuntimeMessage = v.InferOutput<typeof RuntimeMessage>;
export type SnapshotMessage = v.InferOutput<typeof SnapshotSchema>;
export type MessageTarget = RuntimeMessage['target'];

export function parseMessage(raw: unknown): Result<RuntimeMessage, AppError> {
  const parsed = v.safeParse(RuntimeMessage, raw);
  if (parsed.success) return ok(parsed.output);
  return err(appError('invalid_message', parsed.issues[0].message));
}

/** Result of a fetch probe. Only status and URLs, never the body. */
export interface FetchProbe {
  readonly status: number;
  readonly finalUrl: string;
  readonly redirected: boolean;
  /** True when the final URL is not the Moodle login page. */
  readonly sessionSent: boolean;
}

export interface ResponseMap {
  ping: { readonly version: string };
  'content/hello': { readonly accepted: true };
  'logs/export': { readonly text: string };
  'spike/offscreen': { readonly reply: string };
  'spike/open-via-worker': { readonly opened: true };
  'spike/fetch-worker': FetchProbe;
  'spike/fetch-offscreen': FetchProbe;
  'offscreen/ping': { readonly reply: string };
  'offscreen/fetch-probe': FetchProbe;
  'offscreen/sync-course': CourseSyncResult;
  'snapshot/save': { readonly novelties: number };
  'sync/run': SyncSummary;
  'novelties/clear': { readonly cleared: true };
  'content/diagnose': DiagnosticReport;
  'content/test-hypotheses': HypothesisReport;
  'content/download-update': { readonly shown: boolean };
  'download/request': DownloadRequestResponse;
  'download/open': { readonly outcome: 'opened' | 'shown' | 'blocked' };
  'download/show': { readonly shown: true };
  'files/get': {
    readonly downloadId: number;
    readonly extension: string;
    readonly relativePath: string;
  };
  'queue/list': {
    readonly tasks: readonly Task[];
    readonly files: readonly FileRecord[];
    readonly courses: readonly CourseMeta[];
    /** Paused by the user ("Pausar") or by a lost session. */
    readonly paused: boolean;
    readonly pausedBy: 'user' | 'session' | null;
    /** Pending novelties per course id. */
    readonly novelties: Readonly<Record<string, readonly Novelty[]>>;
    readonly sync: SyncStatus;
  };
  'queue/retry-failed': { readonly retried: number };
  'queue/control': { readonly paused: boolean; readonly cancelled: number };
  'download/preview': DownloadPreviewResponse;
  'files/status': {
    readonly files: readonly FileStatusEntry[];
    /** Activities new since the last sync (the "NUEVO" mark). */
    readonly novelties: readonly number[];
  };
}

/** What the offscreen document found for one course. */
export interface CourseSyncResult {
  readonly snapshot: CourseSnapshot;
  /** Downloadable files of items not in `known`, ready for download/request. */
  readonly files: readonly DownloadPayload[];
  readonly readOnly: readonly number[];
  readonly failed: number;
}

export interface SyncStatus {
  /** Courses with a snapshot (synced at least once by hand). */
  readonly tracked: readonly number[];
  readonly lastRunAt: number | null;
  readonly running: boolean;
  /** Background syncs are on hold until a logged-in Aula Digital page is seen. */
  readonly sessionLost: boolean;
}

export interface SyncSummary {
  readonly courses: number;
  readonly novelties: number;
  readonly queued: number;
  /** Why nothing ran, if so. */
  readonly skipped: 'running' | 'no_courses' | 'offline' | 'locked' | 'session_lost' | null;
  readonly errorCode: string | null;
}

export interface DownloadPreviewResponse {
  readonly fileId: string;
  readonly status: FileStatus;
  readonly willDownload: boolean;
  /** Where it would be saved (existing path for files already in the index). */
  readonly relativePath: string;
  readonly size: number | null;
  /** Bulk filter that left it out, if any. */
  readonly omitted: 'extension' | 'size' | null;
}

/** A course file the index knows, for the page badges. */
export interface FileStatusEntry {
  readonly fileId: string;
  readonly cmid: number;
  readonly relativePath: string;
  readonly downloadedAt: number;
  /** null when the browser no longer knows the download. */
  readonly localExists: boolean | null;
}

export interface DownloadRequestResponse {
  readonly status: FileStatus;
  /** queued: download started or waiting; opened: already here, opened; skipped: nothing to do. */
  readonly action: 'queued' | 'opened' | 'skipped';
  readonly fileId: string;
  readonly relativePath: string | null;
  readonly outcome: 'opened' | 'shown' | 'blocked' | null;
}

export type ResponseFor<M extends RuntimeMessage> = Result<ResponseMap[M['type']], AppError>;
