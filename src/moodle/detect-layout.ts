import type { LayoutKind } from '../shared/types';
import { genericAdapter } from './adapters/generic';
import { onetopicAdapter } from './adapters/onetopic';
import { renderedSections } from './adapters/sections';
import { topicsAdapter } from './adapters/topics';
import { weeksAdapter } from './adapters/weeks';
import type { CourseAdapter } from './adapters/adapter';
import { courseContentRoot, queryAll } from './dom';
import { FORMAT_BODY_CLASS, SELECTORS } from './selectors';

export interface LayoutDetection {
  readonly kind: LayoutKind;
  /** Why this layout was chosen; shown in Diagnostics. */
  readonly evidence: readonly string[];
}

const ADAPTERS: Readonly<Record<LayoutKind, CourseAdapter>> = {
  onetopic: onetopicAdapter,
  topics: topicsAdapter,
  weeks: weeksAdapter,
  generic: genericAdapter,
};

export function adapterFor(kind: LayoutKind): CourseAdapter {
  return ADAPTERS[kind];
}

function hasSectionTabs(doc: Document): boolean {
  return queryAll(courseContentRoot(doc), SELECTORS.tabRow).some(
    (row) => row.querySelector('a[href*="/course/view.php"][href*="section="]') !== null,
  );
}

/** Body format class first; structural heuristics for unknown or missing formats. */
export function detectLayout(doc: Document): LayoutDetection {
  const format = FORMAT_BODY_CLASS.exec(doc.body.className)?.[1];
  if (format === 'onetopic' || format === 'topics' || format === 'weeks') {
    return { kind: format, evidence: [`body class format-${format}`] };
  }
  const evidence = [format === undefined ? 'no format-* body class' : `unknown format-${format}`];
  if (hasSectionTabs(doc)) return { kind: 'onetopic', evidence: [...evidence, 'section tabs'] };
  const sections = renderedSections(doc).size;
  if (sections > 0)
    return { kind: 'topics', evidence: [...evidence, `${sections} section elements`] };
  return { kind: 'generic', evidence: [...evidence, 'no sections or tabs'] };
}
