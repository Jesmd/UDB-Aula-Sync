import * as v from 'valibot';
import { DEFAULT_PATH_SETTINGS, type PathSettings } from '../core/paths/build-path';
import { parseTemplate } from '../core/paths/template';
import { SYNC_INTERVAL_HOURS } from '../shared/constants';

/** v2 (M4): hover mode, status badges, filters, per-course overrides, sync interval. */
export const SETTINGS_VERSION = 2;

const templateSchema = v.pipe(
  v.string(),
  v.maxLength(200),
  v.check((t) => parseTemplate(t).ok, 'invalid template'),
);

const extensionList = v.pipe(
  v.array(
    v.pipe(
      v.string(),
      v.trim(),
      v.toLowerCase(),
      v.regex(/^\.?[a-z0-9]{1,10}$/),
      v.transform((e) => e.replace(/^\./, '')),
    ),
  ),
  v.maxLength(40),
);

const sizeMb = v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)));

const PathSettingsSchema = v.object({
  base: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
  template: templateSchema,
  includeParent: v.boolean(),
  groupByCycle: v.boolean(),
  padNumbers: v.boolean(),
  orderPrefix: v.boolean(),
  fileNaming: v.picklist(['actividad', 'original', 'ambos']),
});

const FiltersSchema = v.object({
  /** Never download these extensions (status "omitido"). */
  excludedExtensions: extensionList,
  /** Skip files larger than this; null = no limit. */
  maxSizeMb: sizeMb,
});

/** Per-course settings; null fields inherit the global value. */
export const CourseOverrideSchema = v.object({
  template: v.nullable(templateSchema),
  /** Section (tab) names to leave out, e.g. "Recursos Bibliográficos". Case-insensitive. */
  skipSections: v.pipe(
    v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120))),
    v.maxLength(60),
  ),
  excludedExtensions: v.nullable(extensionList),
  maxSizeMb: sizeMb,
  /** M5: download new material automatically (default off, spec §3.4). */
  autoDownload: v.boolean(),
});

/**
 * User settings (chrome.storage.local). Every read is validated; unknown or broken values
 * fall back to defaults field by field, which also migrates v1 data to v2.
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
  /** Pointer feedback: the small badge (default) or the full details card (spec §3.1). */
  hoverDetails: v.picklist(['simple', 'tarjeta']),
  /** Status pills next to the course's files. */
  showStatusBadges: v.boolean(),
  filters: FiltersSchema,
  syncIntervalHours: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(SYNC_INTERVAL_HOURS.min),
    v.maxValue(48),
  ),
  /** Keyed by Moodle course id. */
  courses: v.record(v.pipe(v.string(), v.regex(/^\d+$/)), CourseOverrideSchema),
});

export type Settings = v.InferOutput<typeof SettingsSchema>;
export type CourseOverride = v.InferOutput<typeof CourseOverrideSchema>;
export type Filters = v.InferOutput<typeof FiltersSchema>;

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  paths: { ...DEFAULT_PATH_SETTINGS },
  updatePolicy: 'conservar_ambas',
  openAfterDownload: true,
  interceptClicks: true,
  hoverDetails: 'simple',
  showStatusBadges: true,
  filters: { excludedExtensions: [], maxSizeMb: null },
  syncIntervalHours: SYNC_INTERVAL_HOURS.default,
  courses: {},
};

export const EMPTY_OVERRIDE: CourseOverride = {
  template: null,
  skipSections: [],
  excludedExtensions: null,
  maxSizeMb: null,
  autoDownload: false,
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function pick<T>(schema: v.GenericSchema<unknown, T>, value: unknown, fallback: T): T {
  const result = v.safeParse(schema, value);
  return result.success ? result.output : fallback;
}

function pickEntries<T extends Record<string, unknown>>(
  entries: Record<string, v.GenericSchema>,
  raw: unknown,
  fallback: T,
): T {
  const input = asRecord(raw);
  return Object.fromEntries(
    Object.entries(entries).map(([key, schema]) => [key, pick(schema, input[key], fallback[key])]),
  ) as T;
}

/** Validates stored data; keeps valid fields, replaces invalid ones with defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const whole = v.safeParse(SettingsSchema, raw);
  if (whole.success) return whole.output;
  const input = asRecord(raw);
  const courses: Record<string, CourseOverride> = {};
  for (const [id, value] of Object.entries(asRecord(input.courses))) {
    if (!/^\d+$/.test(id)) continue;
    courses[id] = pickEntries(CourseOverrideSchema.entries, value, EMPTY_OVERRIDE);
  }
  const e = SettingsSchema.entries;
  return {
    version: SETTINGS_VERSION,
    paths: pickEntries(PathSettingsSchema.entries, input.paths, DEFAULT_SETTINGS.paths),
    updatePolicy: pick(e.updatePolicy, input.updatePolicy, DEFAULT_SETTINGS.updatePolicy),
    openAfterDownload: pick(
      e.openAfterDownload,
      input.openAfterDownload,
      DEFAULT_SETTINGS.openAfterDownload,
    ),
    interceptClicks: pick(
      e.interceptClicks,
      input.interceptClicks,
      DEFAULT_SETTINGS.interceptClicks,
    ),
    hoverDetails: pick(e.hoverDetails, input.hoverDetails, DEFAULT_SETTINGS.hoverDetails),
    showStatusBadges: pick(
      e.showStatusBadges,
      input.showStatusBadges,
      DEFAULT_SETTINGS.showStatusBadges,
    ),
    filters: pickEntries(FiltersSchema.entries, input.filters, DEFAULT_SETTINGS.filters),
    syncIntervalHours: pick(
      e.syncIntervalHours,
      input.syncIntervalHours,
      DEFAULT_SETTINGS.syncIntervalHours,
    ),
    courses,
  };
}

/** Settings as they apply to one course: overrides replace the global values they set. */
export function courseSettings(
  settings: Settings,
  courseId: number,
): { readonly paths: PathSettings; readonly filters: Filters; readonly override: CourseOverride } {
  const override = settings.courses[String(courseId)] ?? EMPTY_OVERRIDE;
  return {
    paths:
      override.template === null
        ? settings.paths
        : { ...settings.paths, template: override.template },
    filters: {
      excludedExtensions: override.excludedExtensions ?? settings.filters.excludedExtensions,
      maxSizeMb: override.maxSizeMb ?? settings.filters.maxSizeMb,
    },
    override,
  };
}
