/**
 * Synthetic seed data. Names come from the spec (§1). Each course page is served from a
 * layout fixture (TODO(verify-real-DOM) until real fixtures replace them).
 */
export interface SeedCourse {
  readonly id: number;
  readonly fullName: string;
  readonly shortName: string;
  /** Fixture under tests/fixtures/moodle/ that renders this course. */
  readonly fixture: string;
}

export const COURSES: readonly SeedCourse[] = [
  {
    id: 101,
    fullName: 'Estadística Aplicada ESA501 G01T (Soyapango)',
    shortName: 'ESA5012026C02G01TCS',
    fixture: 'layouts/onetopic-2level.html',
  },
  {
    id: 102,
    fullName: 'Diseño Digital DMD104 G04L (Soyapango)',
    shortName: 'DMD1042026C02G04LCS',
    fixture: 'layouts/onetopic-dimmed-tabs.html',
  },
  {
    id: 103,
    fullName: 'Introducción a Redes IRD101 G02T (Soyapango)',
    shortName: 'IRD1012026C02G02TCS',
    fixture: 'layouts/topics.html',
  },
  {
    id: 104,
    fullName: 'Matemática Discreta MAD101 G01T (Soyapango)',
    shortName: 'MAD1012026C02G01TCS',
    fixture: 'layouts/weeks.html',
  },
  {
    id: 105,
    fullName: 'Física I FIS101 G01T (Soyapango)',
    shortName: 'FIS1012026C02G01TCS',
    fixture: 'layouts/generic.html',
  },
];
