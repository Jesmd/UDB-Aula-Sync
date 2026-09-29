import { queryFirst } from './dom';
import { SELECTORS } from './selectors';
import type { FetchProbe } from '../shared/messages';

const LOGIN_PATH = /\/login\/index\.php(?:$|[?#])/;

/** Moodle sends anonymous users to login/index.php. */
export function isLoginUrl(url: string): boolean {
  try {
    return LOGIN_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * One GET with the browser's cookies. Reads status and final URL only; the body is
 * cancelled unread. Used by the Diagnostics check for hypothesis H3.
 */
export async function probeSession(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchProbe> {
  const response = await fetchImpl(url, {
    credentials: 'include',
    redirect: 'follow',
    cache: 'no-store',
  });
  await response.body?.cancel();
  return {
    status: response.status,
    finalUrl: response.url,
    redirected: response.redirected,
    sessionSent: response.ok && !isLoginUrl(response.url),
  };
}

/** True for the Moodle login page, which Moodle serves when the session expired. */
export function isLoginDocument(doc: Document): boolean {
  if (doc.body.id === 'page-login-index') return true;
  const form = queryFirst(doc, SELECTORS.loginForm);
  return form !== null && form.querySelector('input[name="password"]') !== null;
}
