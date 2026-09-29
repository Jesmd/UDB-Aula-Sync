import { numberWidth } from '../core/text/pad-numbers';
import { HOVER_DELAY_MS } from '../shared/constants';
import type { DownloadRequestMessage } from '../shared/messages';
import type { CoursePage } from '../moodle/course';
import { intParam } from '../moodle/dom';
import type { ResolvedFile } from '../moodle/resolver/resolve-chain';
import type { Activity } from '../moodle/types';
import type { PageContext } from './page-context';
import type { ResolveCache } from './resolver-client';

const RESOURCE_LINK = 'a[href*="/mod/resource/view.php"]';

/** The resource activity a DOM event is about, if any. */
export function activityFromEvent(event: Event, page: CoursePage): Activity | null {
  const target = event.target as Element | null;
  const link = typeof target?.closest === 'function' ? target.closest(RESOURCE_LINK) : null;
  const href = link?.getAttribute('href');
  if (href == null) return null;
  let cmid: number | null;
  try {
    cmid = intParam(new URL(href, link?.ownerDocument.baseURI).href, 'id');
  } catch {
    cmid = null;
  }
  if (cmid === null) return null;
  const found = page.activities.flatMap((a) => a.items).find((a) => a.cmid === cmid);
  return found?.kind === 'file' && found.available ? found : null;
}

/** Message for the worker: course, section and activity context plus the resolved file. */
export function buildDownloadRequest(
  page: CoursePage,
  activity: Activity,
  file: ResolvedFile,
  open: boolean,
): DownloadRequestMessage | null {
  const index = page.activities.findIndex((a) => a.items.some((i) => i.cmid === activity.cmid));
  const section = page.activities[index]?.section;
  if (section === undefined) return null;
  const position = page.sections.indexOf(section) + 1;
  return {
    target: 'background',
    type: 'download/request',
    courseId: page.course.id,
    cmid: activity.cmid,
    course: { fullName: page.course.fullName, shortName: page.course.shortName },
    section: {
      name: section.name,
      parent: section.parent,
      position: Math.max(1, position),
      numberWidth: Math.min(4, numberWidth(page.sections.map((s) => s.name))),
    },
    activityName: activity.name,
    file: {
      url: file.url,
      fileKey: file.ref.fileKey,
      path: file.ref.path,
      revision: file.ref.revision,
      originalName: file.originalName,
      extension: file.extension,
      size: file.size,
      lastModified: file.lastModified,
      etag: file.etag,
      contentType: file.contentType,
    },
    open,
  };
}

export interface InterceptorDeps {
  readonly doc: Document;
  readonly context: PageContext;
  readonly cache: ResolveCache;
  readonly enabled: () => boolean;
  readonly openAfterDownload: () => boolean;
  readonly onDownload: (message: DownloadRequestMessage, activity: Activity) => void;
  readonly onReadOnly?: (activity: Activity) => void;
  readonly hoverDelayMs?: number;
}

/**
 * Click-to-download (spec §3.2). Hover or keyboard focus resolves the file after 400 ms;
 * a plain click on a resolved file downloads it instead of opening Moodle's page.
 * Ctrl/Cmd/Shift/middle click keep the native behavior; Alt+click only downloads.
 * Anything unresolved or read-only also keeps the native behavior.
 */
export function installInterceptor(deps: InterceptorDeps): () => void {
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  const activityOf = (event: Event): Activity | null => {
    const page = deps.context.get();
    return page.ok ? activityFromEvent(event, page.value) : null;
  };

  const schedule = (event: Event) => {
    if (!deps.enabled()) return;
    const activity = activityOf(event);
    if (activity === null || timers.has(activity.cmid) || deps.cache.peek(activity.cmid) !== null)
      return;
    timers.set(
      activity.cmid,
      setTimeout(() => {
        timers.delete(activity.cmid);
        void deps.cache.get(activity.cmid);
      }, deps.hoverDelayMs ?? HOVER_DELAY_MS),
    );
  };

  const cancel = (event: Event) => {
    // Moving between children of the same link is not leaving it.
    const link = (event.target as Element | null)?.closest(RESOURCE_LINK);
    const related = (event as MouseEvent | FocusEvent).relatedTarget as Node | null;
    if (link != null && related !== null && link.contains(related)) return;
    const activity = activityOf(event);
    const timer = activity === null ? undefined : timers.get(activity.cmid);
    if (activity !== null && timer !== undefined) {
      clearTimeout(timer);
      timers.delete(activity.cmid);
    }
  };

  const click = (event: MouseEvent) => {
    if (!deps.enabled() || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    const page = deps.context.get();
    if (!page.ok) return;
    const activity = activityFromEvent(event, page.value);
    if (activity === null) return;
    const resolution = deps.cache.peek(activity.cmid);
    if (resolution === null) {
      // Not resolved yet: Moodle opens its page, and the next click can download.
      void deps.cache.get(activity.cmid);
      return;
    }
    if (resolution.kind === 'readonly') {
      deps.onReadOnly?.(activity);
      return;
    }
    const message = buildDownloadRequest(
      page.value,
      activity,
      resolution.file,
      !event.altKey && deps.openAfterDownload(),
    );
    if (message === null) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    deps.onDownload(message, activity);
  };

  const options = { capture: true } as const;
  deps.doc.addEventListener('mouseover', schedule, options);
  deps.doc.addEventListener('mouseout', cancel, options);
  deps.doc.addEventListener('focusin', schedule, options);
  deps.doc.addEventListener('focusout', cancel, options);
  deps.doc.addEventListener('click', click, options);
  return () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    deps.doc.removeEventListener('mouseover', schedule, options);
    deps.doc.removeEventListener('mouseout', cancel, options);
    deps.doc.removeEventListener('focusin', schedule, options);
    deps.doc.removeEventListener('focusout', cancel, options);
    deps.doc.removeEventListener('click', click, options);
  };
}
