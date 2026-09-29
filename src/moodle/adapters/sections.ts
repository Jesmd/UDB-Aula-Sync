import { MOODLE_BASE_PATH } from '../../shared/constants';
import { parseActivities } from '../activities';
import { courseContentRoot, queryAll, queryFirst, visibleText } from '../dom';
import { SELECTORS } from '../selectors';
import type { Activity } from '../types';
import type { AdapterContext } from './adapter';

/** Section elements rendered in the document, keyed by section number (id="section-N"). */
export function renderedSections(doc: Document): Map<number, Element> {
  const map = new Map<number, Element>();
  for (const element of queryAll(courseContentRoot(doc), SELECTORS.section)) {
    const match = /^section-(\d+)$/.exec(element.id);
    if (match?.[1] === undefined) continue;
    const number = Number(match[1]);
    if (!map.has(number)) map.set(number, element);
  }
  return map;
}

export function sectionElementName(element: Element, number: number): string {
  const heading = queryFirst(element, SELECTORS.sectionName);
  const name = heading === null ? '' : visibleText(heading);
  if (name !== '') return name;
  const label = element.getAttribute('aria-label')?.trim();
  return label !== undefined && label !== '' ? label : `Sección ${number}`;
}

/** Hidden, or restricted with nothing listed: the student cannot use it. */
export function sectionElementAvailable(element: Element): boolean {
  if (element.classList.contains('hidden')) return false;
  const restricted = queryFirst(element, SELECTORS.sectionRestricted) !== null;
  return !(restricted && queryAll(element, SELECTORS.activity).length === 0);
}

/** Moodle wwwroot for a page URL: origin + /auladigital/ (or "/" elsewhere, e.g. tests). */
export function moodleRoot(pageUrl: string): string {
  const url = new URL(pageUrl);
  const base = url.pathname.startsWith(MOODLE_BASE_PATH) ? MOODLE_BASE_PATH : '/';
  return `${url.origin}${base}`;
}

export function courseViewUrl(ctx: AdapterContext, section?: number): string {
  const url = new URL('course/view.php', moodleRoot(ctx.url));
  url.searchParams.set('id', String(ctx.courseId));
  if (section !== undefined) url.searchParams.set('section', String(section));
  return url.href;
}

export function activitiesOfRenderedSection(
  ctx: AdapterContext,
  sectionNumber: number,
): Activity[] {
  const element = renderedSections(ctx.doc).get(sectionNumber);
  return element === undefined ? [] : parseActivities(element, ctx.url);
}
