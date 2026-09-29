import { absoluteUrl, cleanText, courseContentRoot, intParam, visibleText } from '../dom';
import { classifyModule, extractModname } from '../modules/classify';
import type { Activity, SectionRef } from '../types';
import type { AdapterContext, CourseAdapter } from './adapter';

interface Group {
  readonly name: string;
  readonly activities: Activity[];
}

/**
 * Fallback for unknown formats: groups /mod/<name>/view.php links under the nearest
 * preceding heading. Section numbers are positions, stable for a given page.
 */
function group(ctx: AdapterContext): Group[] {
  const groups: Group[] = [];
  let current: Group = { name: 'General', activities: [] };
  const seen = new Set<number>();

  const nodes = courseContentRoot(ctx.doc).querySelectorAll('h2, h3, h4, h5, a[href*="/mod/"]');
  for (const node of Array.from(nodes)) {
    if (node.tagName !== 'A') {
      if (current.activities.length > 0) groups.push(current);
      current = { name: visibleText(node) || 'Sección', activities: [] };
      continue;
    }
    const url = absoluteUrl(node.getAttribute('href'), ctx.url);
    const modname = url === null ? null : extractModname('', url);
    const cmid = url === null ? null : intParam(url, 'id');
    if (modname === null || cmid === null || seen.has(cmid)) continue;
    seen.add(cmid);
    const { kind, downloadCandidate } = classifyModule(modname);
    current.activities.push({
      cmid,
      modname,
      kind,
      name:
        visibleText(node) || cleanText(node.getAttribute('title') ?? '') || `${modname} ${cmid}`,
      url,
      available: true,
      restricted: false,
      detailsHint: null,
      downloadCandidate,
    });
  }
  if (current.activities.length > 0) groups.push(current);
  return groups;
}

export const genericAdapter: CourseAdapter = {
  kind: 'generic',
  listSections(ctx): SectionRef[] {
    return group(ctx).map((g, index) => ({
      number: index,
      name: g.name,
      parent: null,
      url: ctx.url,
      available: true,
      highlighted: false,
      rendered: true,
    }));
  },
  sectionActivities(ctx, sectionNumber) {
    return group(ctx)[sectionNumber]?.activities ?? [];
  },
};
