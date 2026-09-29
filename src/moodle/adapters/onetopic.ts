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

function readTab(li: Element, ctx: AdapterContext): Tab | null {
  const label = queryFirst(li, SELECTORS.tabLabel);
  if (label === null) return null;
  const url = absoluteUrl(label.getAttribute('href'), ctx.url);
  // Tabs that point to another course or page are not sections.
  if (url !== null && (!url.includes('/course/view.php') || intParam(url, 'id') !== ctx.courseId)) {
    return null;
  }
  const name = visibleText(label) || (label.getAttribute('title')?.trim() ?? '');
  if (name === '') return null;
  return {
    number: url === null ? null : intParam(url, 'section'),
    name,
    url,
    dimmed:
      url === null ||
      hasAnyClass(label, TAB_CLASSES.dimmed) ||
      hasAnyClass(li, TAB_CLASSES.dimmed) ||
      label.getAttribute('aria-disabled') === 'true',
    highlighted:
      hasAnyClass(label, TAB_CLASSES.highlighted) || hasAnyClass(li, TAB_CLASSES.highlighted),
    active:
      hasAnyClass(label, TAB_CLASSES.active) ||
      hasAnyClass(li, TAB_CLASSES.active) ||
      label.getAttribute('aria-selected') === 'true' ||
      label.hasAttribute('aria-current'),
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
 * Two tab layouts are accepted: the level-2 row nested inside its level-1 <li>, or a
 * separate row after the level-1 row (it then belongs to the active level-1 tab).
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
    let parent: string | undefined;
    if (top.includes(entry)) {
      parent = activeLevel1?.name;
    } else {
      parent = first.tabs.find((t) => t.li.contains(entry.row))?.tab.name;
    }
    if (parent === undefined) continue;
    for (const { tab } of entry.tabs) level2.push({ tab, parent });
  }
  return { level1, level2 };
}

function toSection(tab: Tab, parent: string | null, rendered: Map<number, Element>): SectionRef {
  const element = tab.number === null ? undefined : rendered.get(tab.number);
  return {
    number: tab.number,
    name: tab.name,
    parent,
    url: tab.dimmed ? null : tab.url,
    available: !tab.dimmed && (element === undefined || sectionElementAvailable(element)),
    highlighted: tab.highlighted || element?.classList.contains('current') === true,
    rendered: element !== undefined,
  };
}

/** format_onetopic: sections as tabs (two levels); only the selected tab is rendered. */
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
      // Level-1 tabs first, each followed by its children, to keep page order.
      for (const tab of tree.level1) {
        add(toSection(tab, null, rendered));
        for (const child of tree.level2) {
          if (child.parent === tab.name) add(toSection(child.tab, child.parent, rendered));
        }
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
        url: null,
        available: sectionElementAvailable(element),
        highlighted: element.classList.contains('current'),
        rendered: true,
      });
    }
    return [...extras, ...sections];
  },
  sectionActivities: activitiesOfRenderedSection,
};
