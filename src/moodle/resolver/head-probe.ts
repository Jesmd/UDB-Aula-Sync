import {
  parseContentDisposition,
  type ContentDisposition,
} from '../../core/http/content-disposition';
import { appError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { isLoginUrl } from '../session';

/** What the server says about a file, without its body. */
export interface HeaderProbe {
  readonly status: number;
  readonly finalUrl: string;
  readonly redirected: boolean;
  readonly contentType: string | null;
  readonly contentLength: number | null;
  readonly lastModified: string | null;
  readonly etag: string | null;
  readonly disposition: ContentDisposition | null;
  readonly method: 'HEAD' | 'GET';
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function headersOf(response: Response, method: 'HEAD' | 'GET'): HeaderProbe {
  const length = response.headers.get('content-length');
  return {
    status: response.status,
    finalUrl: response.url,
    redirected: response.redirected,
    contentType: response.headers.get('content-type'),
    contentLength: length !== null && /^\d+$/.test(length) ? Number(length) : null,
    lastModified: response.headers.get('last-modified'),
    etag: response.headers.get('etag'),
    disposition: parseContentDisposition(response.headers.get('content-disposition')),
    method,
  };
}

/** Maps session loss, throttling and server errors; ok() for usable responses. */
export function checkResponse(response: Response): Result<Response, AppError> {
  if (isLoginUrl(response.url)) return err(appError('session_expired'));
  if (response.status === 429 || response.status === 503) {
    const retryAfter = response.headers.get('retry-after');
    return err(
      appError(
        'rate_limited',
        retryAfter === null ? String(response.status) : `retry-after=${retryAfter}`,
      ),
    );
  }
  if (!response.ok) return err(appError('http_status', String(response.status)));
  return ok(response);
}

/** Header probe from a response already in hand; the body is cancelled unread. */
export async function probeFromResponse(
  response: Response,
  method: 'HEAD' | 'GET',
): Promise<Result<HeaderProbe, AppError>> {
  const checked = checkResponse(response);
  await response.body?.cancel().catch(() => undefined);
  return checked.ok ? ok(headersOf(response, method)) : checked;
}

const HEAD_UNSUPPORTED = new Set([400, 403, 405, 501]);

/**
 * HEAD first (H4). When the server refuses HEAD, GET and stop reading after the headers:
 * fetch resolves on headers, and cancelling the body aborts the transfer.
 */
export async function probeHeaders(
  url: string,
  fetchImpl: FetchLike,
): Promise<Result<HeaderProbe, AppError>> {
  const init: RequestInit = { credentials: 'include', redirect: 'follow', cache: 'no-store' };
  try {
    const head = await fetchImpl(url, { ...init, method: 'HEAD' });
    if (!HEAD_UNSUPPORTED.has(head.status)) return await probeFromResponse(head, 'HEAD');
    const controller = new AbortController();
    const get = await fetchImpl(url, { ...init, method: 'GET', signal: controller.signal });
    const probe = await probeFromResponse(get, 'GET');
    controller.abort();
    return probe;
  } catch (cause) {
    return err(appError('network', cause instanceof Error ? cause.message : String(cause)));
  }
}
