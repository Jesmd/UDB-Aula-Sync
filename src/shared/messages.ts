import * as v from 'valibot';
import type { DiagnosticReport } from '../moodle/diagnostic';
import { appError, type AppError } from './errors';
import { err, ok, type Result } from './result';

/**
 * Every runtime message is validated on receipt. Senders use the inferred types;
 * receivers call parseMessage() and never trust the raw value.
 */

const BackgroundRequest = v.variant('type', [
  v.object({ target: v.literal('background'), type: v.literal('ping') }),
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
]);

export const RuntimeMessage = v.union([BackgroundRequest, OffscreenRequest, ContentRequest]);

export type BackgroundRequest = v.InferOutput<typeof BackgroundRequest>;
export type OffscreenRequest = v.InferOutput<typeof OffscreenRequest>;
export type ContentRequest = v.InferOutput<typeof ContentRequest>;
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
}

export type ResponseFor<M extends RuntimeMessage> = Result<ResponseMap[M['type']], AppError>;
