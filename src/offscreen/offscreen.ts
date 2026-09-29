import { appError } from '../shared/errors';
import { parseMessage, type OffscreenRequest, type ResponseFor } from '../shared/messages';
import { err, fromPromise, ok } from '../shared/result';
import { politeFetch } from '../core/http/polite-fetch';
import { createRateLimiter } from '../core/http/rate-limiter';
import { syncCourse } from '../moodle/course-sync';
import { probeSession } from '../moodle/session';
import { MOODLE_ROOT_URL } from '../shared/constants';

// One limiter for every background request (2 at a time, 300-800 ms apart).
const limitedFetch = politeFetch((input, init) => fetch(input, init), {
  limiter: createRateLimiter(),
});
const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html');

/**
 * Offscreen document (reason DOM_PARSER). The worker has no DOM, so background HTML
 * parsing runs here through the same moodle/ core the content script uses (M5).
 */

async function handle(message: OffscreenRequest): Promise<ResponseFor<OffscreenRequest>> {
  switch (message.type) {
    case 'offscreen/ping':
      return ok({
        reply: `pong (DOMParser ${typeof DOMParser === 'function' ? 'ok' : 'missing'})`,
      });
    case 'offscreen/fetch-probe':
      return fromPromise(
        () => probeSession(message.url),
        (cause) => appError('network', cause instanceof Error ? cause.message : String(cause)),
      );
    case 'offscreen/sync-course':
      return syncCourse(message.courseId, new Set(message.known), message.skipSections, {
        fetch: limitedFetch,
        parseHtml,
        moodleRoot: MOODLE_ROOT_URL,
        now: Date.now,
      });
  }
}

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const parsed = parseMessage(raw);
  if (!parsed.ok || parsed.value.target !== 'offscreen') return false;
  handle(parsed.value).then(sendResponse, (cause: unknown) => {
    sendResponse(err(appError('unknown', String(cause))));
  });
  return true;
});
