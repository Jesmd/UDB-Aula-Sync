import { PATH_LIMITS } from '../../shared/constants';
import type { AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { padNumbers } from '../text/pad-numbers';
import { sanitizeFileName, sanitizeSegment, splitExtension } from '../text/sanitize-filename';
import { courseDisplayName, courseShortLabel, cycleLabel, parseCourseCode } from './course-code';
import { fileNameBudget, fitFolders, joinRelative, type PathLimits } from './path-limits';
import { DEFAULT_TEMPLATE, parseTemplate, renderTemplate } from './template';

export type FileNaming = 'actividad' | 'original' | 'ambos';

export interface PathSettings {
  /** Folder inside Downloads; may contain "/" for nesting. */
  readonly base: string;
  readonly template: string;
  readonly includeParent: boolean;
  readonly groupByCycle: boolean;
  readonly padNumbers: boolean;
  readonly orderPrefix: boolean;
  readonly fileNaming: FileNaming;
}

export const DEFAULT_PATH_SETTINGS: PathSettings = {
  base: 'UDB',
  template: DEFAULT_TEMPLATE,
  includeParent: true,
  groupByCycle: false,
  padNumbers: true,
  orderPrefix: false,
  fileNaming: 'actividad',
};

export interface PathInput {
  readonly course: { readonly fullName: string; readonly shortName: string | null };
  readonly section: {
    readonly name: string;
    readonly parent: string | null;
    /** 1-based position among sections, for the optional "02 - " prefix. */
    readonly position: number;
    /** Digits for number padding, usually numberWidth() of all section names. */
    readonly numberWidth: number;
  };
  readonly activity: { readonly cmid: number; readonly name: string };
  readonly file: {
    /** Name from Content-Disposition or the URL, with or without extension. */
    readonly originalName: string;
    /** Real extension (from headers or URL), without dot; '' when unknown. */
    readonly extension: string;
    /** mod_folder: subfolders inside the folder; the folder name becomes a folder too. */
    readonly folderPath?: readonly string[];
  };
  /** Another file already uses this path: add the stable " (<cmid>)" suffix. */
  readonly collision?: boolean;
}

export interface BuiltPath {
  readonly segments: readonly string[];
  /** Relative to the browser's Downloads folder, "/"-separated. */
  readonly relativePath: string;
}

function fileBase(input: PathInput, naming: FileNaming): string {
  const original = splitExtension(input.file.originalName).base;
  // Files inside a mod_folder keep their own name: the folder name is already a folder.
  if (input.file.folderPath !== undefined) return original;
  if (naming === 'original') return original;
  if (
    naming === 'ambos' &&
    original.trim() !== '' &&
    original.trim() !== input.activity.name.trim()
  ) {
    return `${input.activity.name} - ${original}`;
  }
  return input.activity.name;
}

function extensionOf(input: PathInput): string {
  if (input.file.extension !== '') return input.file.extension;
  return splitExtension(input.file.originalName).extension;
}

/**
 * Builds the download path from course data (untrusted) and settings. Every segment is
 * sanitized; the result never contains "..", absolute parts or empty segments.
 */
export function buildPath(
  input: PathInput,
  settings: PathSettings = DEFAULT_PATH_SETTINGS,
  limits: PathLimits = PATH_LIMITS,
): Result<BuiltPath, AppError> {
  const template = parseTemplate(settings.template);
  if (!template.ok) return template;

  const code = parseCourseCode(input.course.shortName);
  const pad = (text: string) =>
    settings.padNumbers ? padNumbers(text, input.section.numberWidth) : text;
  let section = pad(input.section.name);
  if (settings.orderPrefix) {
    section = `${String(input.section.position).padStart(Math.max(2, input.section.numberWidth), '0')} - ${section}`;
  }
  const ext = extensionOf(input);

  const rendered = renderTemplate(template.value, {
    base: '\u0000base',
    curso: courseDisplayName(input.course.fullName),
    cursoCorto: courseShortLabel(code, input.course.shortName),
    materia: code?.materia ?? null,
    anio: code?.anio ?? null,
    ciclo: code?.ciclo ?? null,
    grupo: code?.grupo ?? null,
    padre:
      settings.includeParent && input.section.parent !== null ? pad(input.section.parent) : null,
    seccion: section,
    actividad: input.activity.name,
    nombreOriginal: splitExtension(input.file.originalName).base,
    ext,
    archivo: '\u0000archivo',
  });

  const folders: string[] = [];
  for (const segment of rendered.slice(0, -1)) {
    if (segment === '\u0000base') {
      for (const part of settings.base.split(/[/\\]/)) {
        if (part.trim() !== '') folders.push(sanitizeSegment(part, limits.segment));
      }
      const cycle = settings.groupByCycle ? cycleLabel(code) : null;
      if (cycle !== null) folders.push(cycle);
    } else {
      // {base} mixed with other text ("{base}-x") is flattened into one segment.
      folders.push(
        sanitizeSegment(segment.replaceAll('\u0000base', settings.base), limits.segment),
      );
    }
  }
  if (input.file.folderPath !== undefined) {
    folders.push(sanitizeSegment(input.activity.name, limits.segment));
    for (const dir of input.file.folderPath) folders.push(sanitizeSegment(dir, limits.segment));
  }

  const suffix = input.collision === true ? ` (${input.activity.cmid})` : undefined;
  const budget = fileNameBudget(folders, limits);
  const fileName = sanitizeFileName(
    suffix === undefined
      ? { base: fileBase(input, settings.fileNaming), extension: ext }
      : { base: fileBase(input, settings.fileNaming), extension: ext, suffix },
    budget,
  );

  const fitted = fitFolders(folders, fileName, limits);
  if (!fitted.ok) return err(fitted.error);
  const segments = [...fitted.value, fileName];
  return ok({ segments, relativePath: joinRelative(segments) });
}

/**
 * "conservar ambas": puts a suffix such as " (rev 2)" before the extension of the file
 * name in an already built path, staying within the segment limit.
 */
export function withVersionSuffix(
  relativePath: string,
  suffix: string,
  limits: PathLimits = PATH_LIMITS,
): string {
  const segments = relativePath.split('/');
  const fileName = segments.pop() ?? '';
  const { base, extension } = splitExtension(fileName);
  const renamed = sanitizeFileName({ base, extension, suffix }, limits.segment);
  return joinRelative([...segments, renamed]);
}
