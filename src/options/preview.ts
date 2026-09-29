import { buildPath, type PathSettings } from '../core/paths/build-path';
import { TEMPLATE_TOKENS } from '../core/paths/template';
import type { AppError } from '../shared/errors';
import type { Result } from '../shared/result';

/** A made-up but realistic file, to show where things would be saved. */
export const SAMPLE = {
  course: {
    fullName: 'Estadística Aplicada ESA501 G01T (Soyapango)',
    shortName: 'ESA5012026C02G01TCS',
  },
  section: { name: 'Semana 3', parent: 'Unidad 1', position: 4, numberWidth: 2 },
  activity: { cmid: 1, name: 'Guía de ejercicios' },
  file: { originalName: 'guia_semana3.pdf', extension: 'pdf' },
} as const;

export function previewPath(settings: PathSettings): Result<string, AppError> {
  const built = buildPath(SAMPLE, settings);
  return built.ok ? { ok: true, value: built.value.relativePath } : built;
}

export const TOKEN_LIST = TEMPLATE_TOKENS.map((token) => `{${token}}`).join(' ');
