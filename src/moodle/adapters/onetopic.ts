import {
  absoluteUrl,
  courseContentRoot,
  hasAnyClass,
  intParam,
  queryAll,
  queryFirst,
  visibleText,
} from '../dom';
import { SELECTORS, TAB_CLASSES } from '../selectors';
import type { SectionRef } from '../types';
import type { AdapterContext, CourseAdapter } from './adapter';
import {
  activitiesOfRenderedSection,
  courseViewUrl,
  renderedSections,
  sectionElementAvailable,
  sectionElementName,
} from './sections';

interface Tab {
  readonly number: number | null;
  readonly name: string;
  readonly url: string | null;
  readonly dimmed: boolean;
  readonly highlighted: boolean;
  readonly active: boolean;
}

const classSelector = (classes: readonly string[]) => classes.map((c) => `.${c}`).join(', ');
const DIMMED_DESCENDANT = classSelector(TAB_CLASSES.dimmed);
const HIGHLIGHTED_DESCENDANT = classSelector(TAB_CLASSES.highlighted);

/** Checks the link, its <li> and the link's descendants (<innertab>). */
function tabHas(
  li: Element,
  label: Element,
  classes: readonly string[],
  descendant: string,
): boolean {
  return (
    hasAnyClass(label, classes) ||
    hasAnyClass(li, classes) ||
    label.querySelector(descendant) !== null
  );
}

function readTab(li: Element, ctx: AdapterContext): Tab | null {
  const label = queryFirst(li, SELECTORS.tabLabel);
  if (label === null) return null;
  const raw = absoluteUrl(label.getAttribute('href'), ctx.url);
  // Tabs that point to another course or page are not sections.
  if (raw !== null && (!raw.includes('/course/view.php') || intParam(raw, 'id') !== ctx.courseId)) {
    return null;
  }
  // Onetopic appends "#tabs-tree-start"; the section is the same without it.
  const url = raw === null ? null : raw.replace(/#.*$/, '');
  const nameElement = queryFirst(label, SELECTORS.tabName);
  const name =
    (nameElement === null ? '' : visibleText(nameElement)) ||
    visibleText(label) ||
    (label.getAttribute('title')?.trim() ?? '');
  if (name === '') return null;
  const active =
    hasAnyClass(label, TAB_CLASSES.active) ||
    hasAnyClass(li, TAB_CLASSES.active) ||
    label.getAttribute('aria-selected') === 'true' ||
    label.hasAttribute('aria-current');
  return {
    number: url === null ? null : intParam(url, 'section'),
    name,
    url,
    // The active tab has no link (verified); any other tab without a link is unavailable.
    dimmed:
      (url === null && !active) ||
      tabHas(li, label, TAB_CLASSES.dimmed, DIMMED_DESCENDANT) ||
      label.getAttribute('aria-disabled') === 'true',
    highlighted: tabHas(li, label, TAB_CLASSES.highlighted, HIGHLIGHTED_DESCENDANT),
    active,
  };
}

function readRow(row: Element, ctx: AdapterContext): { li: Element; tab: Tab }[] {
  const result: { li: Element; tab: Tab }[] = [];
  for (const li of Array.from(row.children)) {
    if (li.tagName !== 'LI') continue;
    const tab = readTab(li, ctx);
    if (tab !== null) result.push({ li, tab });
  }
  return result;
}

interface TabTree {
  readonly level1: readonly Tab[];
  /** Level-2 tabs with the name of their level-1 parent. */
  readonly level2: readonly { readonly tab: Tab; readonly parent: string }[];
}

/**
 * Two tab layouts are accepted: a separate row after the level-1 row (verified on the real
 * site; it belongs to the active level-1 tab), or a row nested inside its level-1 <li>.
 */
function readTabTree(ctx: AdapterContext): TabTree | null {
  const rows = queryAll(courseContentRoot(ctx.doc), SELECTORS.tabRow)
    .map((row) => ({ row, tabs: readRow(row, ctx) }))
    .filter((entry) => entry.tabs.length > 0);
  const top = rows.filter(
    (entry) => !rows.some((o) => o.row !== entry.row && o.row.contains(entry.row)),
  );
  const first = top[0];
  if (first === undefined) return null;

  const level1 = first.tabs.map((t) => t.tab);
  const level2: { tab: Tab; parent: string }[] = [];
  const activeLevel1 = level1.find((t) => t.active);

  for (const entry of rows) {
    if (entry === first) continue;
    const parent = top.includes(entry)
      ? activeLevel1?.name
      : first.tabs.find((t) => t.li.contains(entry.row))?.tab.name;
    if (parent === undefined) continue;
    for (const { tab } of entry.tabs) level2.push({ tab, parent });
  }
  return { level1, level2 };
}

/** Section shown by this page: ?section=, else the breadcrumb, else the only rendered one. */
function currentSectionNumber(ctx: AdapterContext, rendered: Map<number, Element>): number | null {
  const fromUrl = intParam(ctx.url, 'section');
  if (fromUrl !== null) return fromUrl;
  const crumb = queryFirst(ctx.doc, SELECTORS.breadcrumbCurrent);
  const href = crumb === null ? null : absoluteUrl(crumb.getAttribute('href'), ctx.url);
  const fromCrumb = href === null ? null : intParam(href, 'section');
  if (fromCrumb !== null) return fromCrumb;
  const only = rendered.size === 1 ? rendered.keys().next().value : undefined;
  return only ?? null;
}

function toSection(
  ctx: AdapterContext,
  tab: Tab,
  parent: string | null,
  rendered: Map<number, Element>,
): SectionRef {
  const element = tab.number === null ? undefined : rendered.get(tab.number);
  const available = !tab.dimmed && (element === undefined || sectionElementAvailable(element));
  return {
    number: tab.number,
    name: tab.name,
    parent,
    url: !available || tab.number === null ? null : (tab.url ?? courseViewUrl(ctx, tab.number)),
    available,
    highlighted: tab.highlighted || element?.classList.contains('current') === true,
    rendered: element !== undefined,
  };
}

/**
 * format_onetopic: sections as tabs in up to two levels; only the selected tab is rendered.
 * A level-1 tab with visible children is a group: its own content is its first child
 * (Onetopic's "tab_initial"), so only the children are listed, with the group as parent.
 */
export const onetopicAdapter: CourseAdapter = {
  kind: 'onetopic',
  listSections(ctx) {
    const rendered = renderedSections(ctx.doc);
    const tree = readTabTree(ctx);
    const sections: SectionRef[] = [];
    const seen = new Set<string>();
    const add = (section: SectionRef) => {
      const key =
        section.number === null
          ? `name:${section.parent ?? ''}/${section.name}`
          : `n:${section.number}`;
      if (seen.has(key)) return;
      seen.add(key);
      sections.push(section);
    };

    if (tree !== null) {
      // The active tab carries no link, so its number comes from the page itself.
      const current = currentSectionNumber(ctx, rendered);
      const withCurrent = (tab: Tab): Tab =>
        tab.active && tab.number === null && current !== null ? { ...tab, number: current } : tab;
      const activeChild = tree.level2.some((c) => c.tab.active);

      for (const tab of tree.level1) {
        const children = tree.level2.filter((c) => c.parent === tab.name);
        if (children.length === 0) {
          add(toSection(ctx, activeChild ? tab : withCurrent(tab), null, rendered));
          continue;
        }
        for (const child of children)
          add(toSection(ctx, withCurrent(child.tab), child.parent, rendered));
      }
    }
    // Rendered sections without a tab (e.g. section 0 shown above the tabs).
    const extras: SectionRef[] = [];
    for (const [number, element] of rendered) {
      if (seen.has(`n:${number}`)) continue;
      extras.push({
        number,
        name: sectionElementName(element, number),
        parent: null,
        url: courseViewUrl(ctx, number),
        available: sectionElementAvailable(element),
        highlighted: element.classList.contains('current'),
        rendered: true,
      });
    }
    return [...extras, ...sections];
  },
  sectionActivities: activitiesOfRenderedSection,
};
