import { absoluteUrl, cleanText, intParam, queryAll, queryFirst, visibleText } from './dom';
import { classifyModule, extractModname } from './modules/classify';
import { SELECTORS } from './selectors';
import type { Activity } from './types';

const MAX_LABEL_NAME = 120;

function moduleIdFromElement(element: Element): number | null {
  const match = /^module-(\d+)$/.exec(element.id);
  if (match?.[1] !== undefined) return Number(match[1]);
  const data = element.getAttribute('data-id');
  return data !== null && /^\d+$/.test(data) ? Number(data) : null;
}

function activityName(item: Element, link: Element | null, modname: string): string {
  const nameElement = queryFirst(item, SELECTORS.activityName);
  if (nameElement !== null) return visibleText(nameElement);
  if (link !== null) return visibleText(link);
  if (modname === 'label') {
    const text = queryFirst(item, SELECTORS.labelText);
    const value = text === null ? visibleText(item) : visibleText(text);
    return value.length > MAX_LABEL_NAME ? `${value.slice(0, MAX_LABEL_NAME - 1)}…` : value;
  }
  return visibleText(item);
}

/** Parses one activity list item. Returns null when it has no usable module id. */
export function parseActivity(item: Element, baseUrl: string): Activity | null {
  const link = queryFirst(item, SELECTORS.activityLink);
  const url = absoluteUrl(link?.getAttribute('href') ?? null, baseUrl);
  const modname = extractModname(item.className, url);
  const cmid = moduleIdFromElement(item) ?? (url === null ? null : intParam(url, 'id'));
  if (modname === null || cmid === null) return null;

  const { kind, downloadCandidate } = classifyModule(modname);
  const details = queryFirst(item, SELECTORS.activityDetails);
  return {
    cmid,
    modname,
    kind,
    name: activityName(item, link, modname),
    url,
    available: url !== null || modname === 'label',
    restricted: queryFirst(item, SELECTORS.activityRestricted) !== null,
    detailsHint: details === null ? null : cleanText(details.textContent) || null,
    downloadCandidate,
  };
}

/** Activities inside a container (a section element), in document order, without duplicates. */
export function parseActivities(container: ParentNode, baseUrl: string): Activity[] {
  const seen = new Set<number>();
  const result: Activity[] = [];
  for (const item of queryAll(container, SELECTORS.activity)) {
    const activity = parseActivity(item, baseUrl);
    if (activity === null || seen.has(activity.cmid)) continue;
    seen.add(activity.cmid);
    result.push(activity);
  }
  return result;
}
