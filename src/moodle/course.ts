import { appError, type AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';
import type { AdapterContext } from './adapters/adapter';
import { adapterFor, detectLayout, type LayoutDetection } from './detect-layout';
import { absoluteUrl, cleanText, intParam, queryAll, queryFirst, visibleText } from './dom';
import { COURSE_BODY_CLASS, SELECTORS } from './selectors';
import { isLoginDocument } from './session';
import type { Activity, CourseInfo, ParsedCourse, SectionRef } from './types';

function courseId(doc: Document, url: string): number | null {
  const byClass = COURSE_BODY_CLASS.exec(doc.body.className)?.[1];
  if (byClass !== undefined) return Number(byClass);
  return url.includes('/course/view.php') ? intParam(url, 'id') : null;
}

function courseInfo(doc: Document, url: string, id: number): CourseInfo {
  const shortLink = queryAll(doc, SELECTORS.breadcrumbCourseLink).find((a) => {
    const href = absoluteUrl(a.getAttribute('href'), url);
    return href !== null && intParam(href, 'id') === id && intParam(href, 'section') === null;
  });
  const shortName = shortLink === undefined ? null : visibleText(shortLink) || null;
  const title = queryFirst(doc, SELECTORS.pageTitle);
  const fromPage =
    (title === null ? '' : visibleText(title)) || cleanText(doc.title.replace(/^Curso:\s*/i, ''));
  const fullName = fromPage === '' ? (shortName ?? `Curso ${id}`) : fromPage;
  return { id, fullName, shortName };
}

interface Loaded {
  readonly ctx: AdapterContext;
  readonly detection: LayoutDetection;
  readonly course: CourseInfo;
}

function load(doc: Document, url: string): Result<Loaded, AppError> {
  if (isLoginDocument(doc)) return err(appError('session_expired'));
  const id = courseId(doc, url);
  if (id === null) return err(appError('not_course_page'));
  return ok({
    ctx: { doc, url, courseId: id },
    detection: detectLayout(doc),
    course: courseInfo(doc, url, id),
  });
}

/** Course identity, layout and every section the page lists. */
export function parseCourse(doc: Document, url: string): Result<ParsedCourse, AppError> {
  const loaded = load(doc, url);
  if (!loaded.ok) return loaded;
  const { ctx, detection, course } = loaded.value;
  return ok({
    course,
    layout: detection.kind,
    sections: adapterFor(detection.kind).listSections(ctx),
  });
}

/** Activities of one section rendered in this document; empty when not rendered. */
export function parseSection(
  doc: Document,
  url: string,
  sectionNumber: number,
): Result<Activity[], AppError> {
  const loaded = load(doc, url);
  if (!loaded.ok) return loaded;
  const { ctx, detection } = loaded.value;
  return ok(adapterFor(detection.kind).sectionActivities(ctx, sectionNumber));
}

export interface CoursePage extends ParsedCourse {
  readonly detection: LayoutDetection;
  readonly activities: readonly {
    readonly section: SectionRef;
    readonly items: readonly Activity[];
  }[];
}

/** Everything this document shows: course, sections and activities of rendered sections. */
export function parseCoursePage(doc: Document, url: string): Result<CoursePage, AppError> {
  const loaded = load(doc, url);
  if (!loaded.ok) return loaded;
  const { ctx, detection, course } = loaded.value;
  const adapter = adapterFor(detection.kind);
  const sections = adapter.listSections(ctx);
  const activities = sections
    .filter((s): s is SectionRef & { number: number } => s.rendered && s.number !== null)
    .map((section) => ({ section, items: adapter.sectionActivities(ctx, section.number) }));
  return ok({ course, layout: detection.kind, detection, sections, activities });
}
