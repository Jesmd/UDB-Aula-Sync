import * as v from 'valibot';
import { DEFAULT_PATH_SETTINGS } from '../core/paths/build-path';
import { parseTemplate } from '../core/paths/template';

export const SETTINGS_VERSION = 1;

const PathSettingsSchema = v.object({
  base: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
  template: v.pipe(
    v.string(),
    v.maxLength(200),
    v.check((t) => parseTemplate(t).ok, 'invalid template'),
  ),
  includeParent: v.boolean(),
  groupByCycle: v.boolean(),
  padNumbers: v.boolean(),
  orderPrefix: v.boolean(),
  fileNaming: v.picklist(['actividad', 'original', 'ambos']),
});

/**
 * User settings (chrome.storage.local). Every read is validated; unknown or broken values
 * fall back to defaults field by field. M4 adds the options UI and per-course overrides.
 */
export const SettingsSchema = v.object({
  version: v.literal(SETTINGS_VERSION),
  paths: PathSettingsSchema,
  /** "conservar_ambas" by default: never lose a copy the student may have annotated. */
  updatePolicy: v.picklist(['omitir', 'sobrescribir', 'conservar_ambas']),
  /** Open after a click-download (allowlisted types only, see safe-open). */
  openAfterDownload: v.boolean(),
  /** Take over clicks on downloadable activities (spec §3.2). */
  interceptClicks: v.boolean(),
});

export type Settings = v.InferOutput<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  paths: { ...DEFAULT_PATH_SETTINGS },
  updatePolicy: 'conservar_ambas',
  openAfterDownload: true,
  interceptClicks: true,
};

/** Validates stored data; keeps valid fields, replaces invalid ones with defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const whole = v.safeParse(SettingsSchema, raw);
  if (whole.success) return whole.output;
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const rawPaths = (
    typeof input.paths === 'object' && input.paths !== null ? input.paths : {}
  ) as Record<string, unknown>;
  const pick = <T>(schema: v.GenericSchema<T>, value: unknown, fallback: T): T => {
    const result = v.safeParse(schema, value);
    return result.success ? result.output : fallback;
  };
  const pathEntries = PathSettingsSchema.entries;
  const paths = Object.fromEntries(
    (Object.keys(pathEntries) as (keyof typeof pathEntries)[]).map((key) => [
      key,
      pick(pathEntries[key] as v.GenericSchema, rawPaths[key], DEFAULT_SETTINGS.paths[key]),
    ]),
  ) as Settings['paths'];
  return {
    version: SETTINGS_VERSION,
    paths,
    updatePolicy: pick(
      SettingsSchema.entries.updatePolicy,
      input.updatePolicy,
      DEFAULT_SETTINGS.updatePolicy,
    ),
    openAfterDownload: pick(
      v.boolean(),
      input.openAfterDownload,
      DEFAULT_SETTINGS.openAfterDownload,
    ),
    interceptClicks: pick(v.boolean(), input.interceptClicks, DEFAULT_SETTINGS.interceptClicks),
  };
}
