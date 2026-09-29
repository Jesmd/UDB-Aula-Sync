import { appError, type AppError } from '../shared/errors';
import type { CourseSyncResult } from '../shared/messages';
import { err, ok, type Result } from '../shared/result';
import type { HtmlParser } from './html-parser';
import { payloadFor } from './payload';
import { checkResponse, type FetchLike } from './resolver/head-probe';
import { resolveItems, scanCourse } from './scan';
import { snapshotFromScan } from './snapshot';

export interface CourseSyncDeps {
  /** Polite fetch: shared limiter, retries on 429/5xx. */
  readonly fetch: FetchLike;
  readonly parseHtml: HtmlParser;
  readonly moodleRoot: string;
  readonly now: () => number;
}

/**
 * Background sync of one course (spec §3.4, §5): load its page, scan the available
 * sections and resolve only the downloadable items the last snapshot did not have.
 * A lost session stops at once, before any other request.
 */
export async function syncCourse(
  courseId: number,
  known: ReadonlySet<number>,
  skipSections: readonly string[],
  deps: CourseSyncDeps,
): Promise<Result<CourseSyncResult, AppError>> {
  const url = `${deps.moodleRoot}course/view.php?id=${courseId}`;
  let response: Response;
  try {
    response = await deps.fetch(url, { credentials: 'include', cache: 'no-store' });
  } catch (cause) {
    return err(appError('network', cause instanceof Error ? cause.message : String(cause)));
  }
  const checked = checkResponse(response);
  if (!checked.ok) return checked;
  const doc = deps.parseHtml(await response.text());
  const scan = await scanCourse(doc, response.url, { kind: 'course' }, skipSections, deps);
  if (!scan.ok) return scan;
  if (scan.value.course.id !== courseId)
    return err(appError('not_course_page', `expected course ${courseId}`));

  const fresh = scan.value.items.filter(
    (i) => i.activity.downloadCandidate && i.activity.available && !known.has(i.activity.cmid),
  );
  const resolved = await resolveItems(fresh, response.url, deps);
  if (!resolved.ok) return resolved;
  return ok({
    snapshot: snapshotFromScan(scan.value, deps.now()),
    files: resolved.value.files.map((f) => payloadFor(scan.value, f)),
    readOnly: resolved.value.readOnly.map((i) => i.activity.cmid),
    failed: resolved.value.failed.length,
  });
}
