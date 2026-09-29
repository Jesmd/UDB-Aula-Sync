import type { LayoutKind } from '../shared/types';

export interface CourseInfo {
  readonly id: number;
  /** Full name from the page header, e.g. "Estadística Aplicada ESA501 G01T (Soyapango)". */
  readonly fullName: string;
  /** Course code from the breadcrumbs, e.g. "ESA5012026C02G01TCS". Optional. */
  readonly shortName: string | null;
}

export interface SectionRef {
  /** Moodle section number. Null only for a tab without a link (unknown number). */
  readonly number: number | null;
  readonly name: string;
  /** Level-1 tab name for level-2 tabs (Onetopic); null otherwise. */
  readonly parent: string | null;
  /** URL that renders this section. Topics/weeks: the course page itself. */
  readonly url: string | null;
  /** False for dimmed tabs, hidden or restricted sections. */
  readonly available: boolean;
  /** Highlighted/current section (★ in Onetopic, .current in topics/weeks). */
  readonly highlighted: boolean;
  /** True when this document contains the section's activities. */
  readonly rendered: boolean;
}

export type ActivityKind =
  'file' | 'folder' | 'url' | 'assign' | 'forum' | 'label' | 'page' | 'quiz' | 'other';

export interface Activity {
  readonly cmid: number;
  /** Moodle module name from modtype_* or the /mod/<name>/ URL segment. */
  readonly modname: string;
  readonly kind: ActivityKind;
  readonly name: string;
  readonly url: string | null;
  /** False when the student cannot open it (no link). */
  readonly available: boolean;
  /** An availability notice is shown (may still be available). */
  readonly restricted: boolean;
  /** Raw "1.2MB PDF document" style hint. Never used to decide the type. */
  readonly detailsHint: string | null;
  /** Worth resolving for a file (resource, folder). */
  readonly downloadCandidate: boolean;
}

export interface ParsedCourse {
  readonly course: CourseInfo;
  readonly layout: LayoutKind;
  readonly sections: readonly SectionRef[];
}
