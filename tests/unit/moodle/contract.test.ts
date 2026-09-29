import { describe, expect, it } from 'vitest';
import { parseCourse, parseCoursePage, parseSection } from '../../../src/moodle/course';
import { adapterFor, detectLayout } from '../../../src/moodle/detect-layout';
import type { LayoutKind } from '../../../src/shared/types';
import { courseUrl, loadFixture } from '../../helpers/fixtures';

/**
 * Contract suite: every adapter must satisfy the same invariants on its fixture,
 * plus the fixture-specific expectations below.
 */
interface Case {
  readonly name: string;
  readonly fixture: string;
  readonly url: string;
  readonly layout: LayoutKind;
  readonly courseId: number;
  readonly shortName: string;
  readonly sectionCount: number;
  readonly rendered: readonly number[];
  readonly unavailable: readonly string[];
  readonly highlighted: readonly string[];
}

const CASES: readonly Case[] = [
  {
    name: 'A: onetopic, two levels',
    fixture: 'layouts/onetopic-2level.html',
    url: courseUrl(101, 14),
    layout: 'onetopic',
    courseId: 101,
    shortName: 'ESA5012026C02G01TCS',
    sectionCount: 2 + 1 + 18,
    rendered: [14],
    unavailable: [],
    highlighted: ['Semana 12'],
  },
  {
    name: 'A: onetopic, dimmed tabs',
    fixture: 'layouts/onetopic-dimmed-tabs.html',
    url: courseUrl(102, 15),
    layout: 'onetopic',
    courseId: 102,
    shortName: 'DMD1042026C02G04LCS',
    sectionCount: 1 + 1 + 19 + 1,
    rendered: [15],
    unavailable: [
      'Semana 13',
      'Semana 14',
      'Semana 15',
      'Semana 16',
      'Semana 17',
      'Semana 18',
      'Semana 19',
    ],
    highlighted: ['Semana 12'],
  },
  {
    name: 'A: onetopic, real site (49946)',
    fixture: 'real/onetopic-2level-49946.html',
    url: courseUrl(49946, 2),
    layout: 'onetopic',
    courseId: 49946,
    shortName: 'DMD1042026C02G02TCS',
    sectionCount: 10,
    rendered: [2],
    unavailable: [],
    highlighted: ['General'],
  },
  {
    name: 'B: topics, real site (50454)',
    fixture: 'real/topics-50454.html',
    url: courseUrl(50454),
    layout: 'topics',
    courseId: 50454,
    shortName: 'IRD1012026C02G02TCS',
    sectionCount: 20,
    rendered: Array.from({ length: 20 }, (_, i) => i),
    unavailable: [],
    highlighted: [],
  },
  {
    name: 'B: topics',
    fixture: 'layouts/topics.html',
    url: courseUrl(103),
    layout: 'topics',
    courseId: 103,
    shortName: 'IRD1012026C02G02TCS',
    sectionCount: 13,
    rendered: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    unavailable: ['Tema 12'],
    highlighted: ['Tema 4'],
  },
  {
    name: 'weeks',
    fixture: 'layouts/weeks.html',
    url: courseUrl(104),
    layout: 'weeks',
    courseId: 104,
    shortName: 'MAD1012026C02G01TCS',
    sectionCount: 4,
    rendered: [0, 1, 2, 3],
    unavailable: ['18 agosto - 24 agosto'],
    highlighted: ['11 agosto - 17 agosto'],
  },
  {
    name: 'generic (unknown format)',
    fixture: 'layouts/generic.html',
    url: courseUrl(105),
    layout: 'generic',
    courseId: 105,
    shortName: 'FIS1012026C02G01TCS',
    sectionCount: 2,
    rendered: [0, 1],
    unavailable: [],
    highlighted: [],
  },
];

describe.each(CASES)('adapter contract: $name', (c) => {
  const doc = loadFixture(c.fixture, c.url);
  const parsed = parseCourse(doc, c.url);
  if (!parsed.ok) throw new Error(`parseCourse failed: ${parsed.error.code}`);
  const { course, layout, sections } = parsed.value;

  it('detects the layout and course', () => {
    expect(detectLayout(doc).kind).toBe(c.layout);
    expect(layout).toBe(c.layout);
    expect(adapterFor(layout).kind).toBe(c.layout);
    expect(course.id).toBe(c.courseId);
    expect(course.shortName).toBe(c.shortName);
    expect(course.fullName).toMatch(/\(Soyapango\)$/);
  });

  it('lists sections with clean, non-empty names and unique numbers', () => {
    expect(sections).toHaveLength(c.sectionCount);
    const numbers = sections.map((s) => s.number).filter((n) => n !== null);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const s of sections) {
      expect(s.name).not.toBe('');
      expect(s.name).toBe(s.name.trim());
      expect(s.name).not.toMatch(/\s{2,}|★/);
    }
  });

  it('marks rendered, unavailable and highlighted sections', () => {
    expect(sections.filter((s) => s.rendered).map((s) => s.number)).toEqual(c.rendered);
    expect(sections.filter((s) => !s.available).map((s) => s.name)).toEqual(c.unavailable);
    expect(sections.filter((s) => s.highlighted).map((s) => s.name)).toEqual(c.highlighted);
  });

  it('gives a fetch URL to every available section of this course', () => {
    for (const s of sections.filter((x) => x.available && !x.rendered)) {
      expect(s.url).not.toBeNull();
      const url = new URL(s.url ?? '');
      expect(url.pathname).toBe('/auladigital/course/view.php');
      expect(url.searchParams.get('id')).toBe(String(c.courseId));
    }
  });

  it('extracts activities only from rendered sections, with valid ids and links', () => {
    const page = parseCoursePage(doc, c.url);
    if (!page.ok) throw new Error(page.error.code);
    const all = page.value.activities.flatMap((a) => a.items);
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((a) => a.cmid)).size).toBe(all.length);
    for (const a of all) {
      expect(a.name).not.toBe('');
      expect(a.name).not.toMatch(/ (Archivo|Carpeta|Tarea|Foro|URL)$/);
      if (a.url !== null) {
        const url = new URL(a.url);
        expect(url.pathname).toBe(`/auladigital/mod/${a.modname}/view.php`);
        expect(url.searchParams.get('id')).toBe(String(a.cmid));
      }
      expect(a.downloadCandidate).toBe(a.modname === 'resource' || a.modname === 'folder');
    }
    for (const s of sections.filter((x) => !x.rendered && x.number !== null)) {
      const result = parseSection(doc, c.url, s.number ?? -1);
      expect(result.ok && result.value).toEqual([]);
    }
  });
});
