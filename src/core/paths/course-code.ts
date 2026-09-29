/**
 * UDB course codes, e.g. "ESA5012026C02G01TCS": subject (3 letters + 3 digits), year,
 * "C" + cycle, "G" + group, T|L (theory/lab), campus suffix. Parsing is optional:
 * callers fall back to the full name. Verified on 3 real codes (spec §1, reports 49946, 50454).
 */
export interface CourseCode {
  readonly materia: string;
  readonly anio: string;
  readonly ciclo: string;
  readonly grupo: string;
  readonly modalidad: 'T' | 'L';
  readonly campus: string;
}

const CODE = /^([A-Z]{3}\d{3})(\d{4})C(\d{2})G(\d{2})([TL])([A-Z]{1,4})$/;

export function parseCourseCode(shortName: string | null): CourseCode | null {
  const match = shortName === null ? null : CODE.exec(shortName.trim().toUpperCase());
  if (match === null) return null;
  const [, materia, anio, ciclo, grupo, modalidad, campus] = match;
  if (
    materia === undefined ||
    anio === undefined ||
    ciclo === undefined ||
    grupo === undefined ||
    campus === undefined ||
    (modalidad !== 'T' && modalidad !== 'L')
  ) {
    return null;
  }
  return { materia, anio, ciclo, grupo, modalidad, campus };
}

/** "Estadística Aplicada ESA501 G01T (Soyapango)" -> "Estadística Aplicada ESA501 G01T". */
export function courseDisplayName(fullName: string): string {
  const trimmed = fullName.replace(/\s*\([^()]*\)\s*$/, '').trim();
  return trimmed === '' ? fullName.trim() : trimmed;
}

/** "ESA501 G01T" from the code; the short name itself when it does not parse. */
export function courseShortLabel(code: CourseCode | null, shortName: string | null): string | null {
  if (code !== null) return `${code.materia} G${code.grupo}${code.modalidad}`;
  return shortName;
}

/** "2026-C02", for the optional "group by cycle" folder. */
export function cycleLabel(code: CourseCode | null): string | null {
  return code === null ? null : `${code.anio}-C${code.ciclo}`;
}
