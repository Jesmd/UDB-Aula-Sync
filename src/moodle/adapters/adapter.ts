import type { LayoutKind } from '../../shared/types';
import type { Activity, SectionRef } from '../types';

export interface AdapterContext {
  readonly doc: Document;
  /** URL the document was loaded from; base for relative links. */
  readonly url: string;
  readonly courseId: number;
}

/**
 * One adapter per course layout. Every adapter must pass the shared contract suite
 * (tests/unit/moodle/contract.test.ts).
 */
export interface CourseAdapter {
  readonly kind: LayoutKind;
  /** Every section the page knows about, rendered or not, in page order. */
  listSections(ctx: AdapterContext): SectionRef[];
  /** Activities of a section rendered in ctx.doc; empty when it is not rendered. */
  sectionActivities(ctx: AdapterContext, sectionNumber: number): Activity[];
}
