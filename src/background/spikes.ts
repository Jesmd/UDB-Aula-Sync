import { MOODLE_ROOT_URL } from '../shared/constants';
import { appError, type AppError } from '../shared/errors';
import type { FetchProbe } from '../shared/messages';
import { fromPromise, type Result } from '../shared/result';
import { probeSession } from '../moodle/session';
import { sendToOffscreen } from './offscreen-client';

/**
 * M0 compatibility checks, triggered only from the Diagnostics page by an explicit click.
 * Results are recorded by hand in docs/MOODLE-NOTES.md.
 */

export const SESSION_PROBE_URL = `${MOODLE_ROOT_URL}my/`;

export async function spikeOffscreen(): Promise<Result<{ reply: string }, AppError>> {
  return sendToOffscreen({ target: 'offscreen', type: 'offscreen/ping' });
}

/** Tests whether downloads.open works from the worker, where no user gesture exists. */
export async function spikeOpenViaWorker(
  downloadId: number,
): Promise<Result<{ opened: true }, AppError>> {
  return fromPromise(
    async () => {
      await chrome.downloads.open(downloadId);
      return { opened: true } as const;
    },
    (cause) => appError('open_blocked', cause instanceof Error ? cause.message : String(cause)),
  );
}

export async function spikeFetchWorker(): Promise<Result<FetchProbe, AppError>> {
  return fromPromise(
    () => probeSession(SESSION_PROBE_URL),
    (cause) => appError('network', cause instanceof Error ? cause.message : String(cause)),
  );
}

export async function spikeFetchOffscreen(): Promise<Result<FetchProbe, AppError>> {
  return sendToOffscreen({
    target: 'offscreen',
    type: 'offscreen/fetch-probe',
    url: SESSION_PROBE_URL,
  });
}
