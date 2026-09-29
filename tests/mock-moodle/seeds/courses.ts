/**
 * Synthetic seed data. Names come from the spec (§1); structure is NOT the real DOM
 * and grows with fixtures in M1. TODO(verify-real-DOM)
 */
export interface SeedCourse {
  readonly id: number;
  readonly fullName: string;
  readonly shortName: string;
}

export const COURSES: readonly SeedCourse[] = [
  {
    id: 101,
    fullName: 'Estadística Aplicada ESA501 G01T (Soyapango)',
    shortName: 'ESA5012026C02G01TCS',
  },
  { id: 102, fullName: 'Diseño Digital DMD104 G04L (Soyapango)', shortName: 'DMD1042026C02G04LCS' },
  {
    id: 103,
    fullName: 'Introducción a Redes IRD101 G02T (Soyapango)',
    shortName: 'IRD1012026C02G02TCS',
  },
];
