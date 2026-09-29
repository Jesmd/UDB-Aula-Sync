import * as v from 'valibot';
import type { DiagnosticReport } from '../moodle/diagnostic';
import type { HypothesisReport } from '../moodle/hypotheses';
import type { Task } from '../core/queue/task';
import type { FileRecord } from '../storage/db';
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

const DownloadRequestMessage = v.object({
  target: v.literal('background'),
  type: v.literal('download/request'),
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
  open: v.boolean(),
});

const BackgroundRequest = v.variant('type', [
  v.object({ target: v.literal('background'), type: v.literal('ping') }),
  DownloadRequestMessage,
  v.object({ target: v.literal('background'), type: v.literal('download/open'), fileId }),
  v.object({ target: v.literal('background'), type: v.literal('download/show'), fileId }),
  v.object({ target: v.literal('background'), type: v.literal('queue/list') }),
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
]);

const OffscreenRequest = v.variant('type', [
  v.object({ target: v.literal('offscreen'), type: v.literal('offscreen/ping') }),
  v.object({
    target: v.literal('offscreen'),
    type: v.literal('offscreen/fetch-probe'),
    url: v.pipe(v.string(), v.url(), v.maxLength(2048)),
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
export type DownloadUpdateMessage = Extract<ContentRequest, { type: 'content/download-update' }>;
export type RuntimeMessage = v.InferOutput<typeof RuntimeMessage>;
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
  'content/diagnose': DiagnosticReport;
  'content/test-hypotheses': HypothesisReport;
  'content/download-update': { readonly shown: boolean };
  'download/request': DownloadRequestResponse;
  'download/open': { readonly outcome: 'opened' | 'shown' | 'blocked' };
  'download/show': { readonly shown: true };
  'queue/list': {
    readonly tasks: readonly Task[];
    readonly files: readonly FileRecord[];
    readonly paused: boolean;
  };
  'queue/retry-failed': { readonly retried: number };
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
