import type { LayoutKind } from '../../shared/types';
import type { SectionRef } from '../types';
import type { AdapterContext, CourseAdapter } from './adapter';
import {
  activitiesOfRenderedSection,
  courseViewUrl,
  renderedSections,
  sectionElementAvailable,
  sectionElementName,
} from './sections';

/**
 * Single long page with every section rendered (format_topics, format_weeks).
 * One request fetches the whole course, so every section shares the course URL.
 */
export function createSectionedPageAdapter(kind: LayoutKind): CourseAdapter {
  return {
    kind,
    listSections(ctx: AdapterContext): SectionRef[] {
      const url = courseViewUrl(ctx);
      return Array.from(renderedSections(ctx.doc), ([number, element]) => ({
        number,
        name: sectionElementName(element, number),
        parent: null,
        url,
        available: sectionElementAvailable(element),
        highlighted: element.classList.contains('current'),
        rendered: true,
      }));
    },
    sectionActivities: activitiesOfRenderedSection,
  };
}

export const topicsAdapter = createSectionedPageAdapter('topics');
