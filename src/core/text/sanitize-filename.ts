import {
  collapseWhitespace,
  stripControl,
  toNFC,
  truncateCodePoints,
  codePointLength,
} from './unicode';
import { escapeWindowsReserved } from './windows-reserved';

/**
 * Every course text is untrusted. A sanitized segment is safe as one folder or file
 * name on Windows, macOS and Linux, and never "." , ".." or empty.
 */

export const FALLBACK_SEGMENT = '_';

/** Separators become " - " (readable: "Guia 1: X" -> "Guia 1 - X"); the rest is dropped. */
const SEPARATORS = /\s*[:/\\|]+\s*/g;
const FORBIDDEN = /[<>"?*]/g;

export function sanitizeSegment(text: string, maxLength = 120): string {
  let value = toNFC(stripControl(text));
  value = value.replace(SEPARATORS, ' - ').replace(FORBIDDEN, '');
  value = collapseWhitespace(value).replace(/(?: - )+/g, ' - ');
  value = value.replace(/^(?:- )+|(?: -)+$/g, '');
  value = truncateCodePoints(value, maxLength);
  // No trailing dot or space (Windows strips them silently).
  value = value.replace(/[. ]+$/, '');
  value = escapeWindowsReserved(value);
  return value === '' || /^\.+$/.test(value) ? FALLBACK_SEGMENT : value;
}

/** Lower-case extension without dot; empty when absent or not a plausible extension. */
export function sanitizeExtension(ext: string): string {
  const clean = ext.replace(/^\.+/, '').toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(clean) ? clean : '';
}

export interface FileNameParts {
  readonly base: string;
  readonly extension: string;
  /** Appended before the extension, kept whole when truncating, e.g. " (123)". */
  readonly suffix?: string;
}

/** Builds "<base><suffix>.<ext>" within maxLength, shortening only the base. */
export function sanitizeFileName(parts: FileNameParts, maxLength = 120): string {
  const extension = sanitizeExtension(parts.extension);
  const tail = `${parts.suffix ?? ''}${extension === '' ? '' : `.${extension}`}`;
  const room = Math.max(1, maxLength - codePointLength(tail));
  let base = sanitizeSegment(parts.base, room);
  // A base that already ends with the extension ("Guia.pdf" + "pdf") is not doubled.
  if (
    extension !== '' &&
    base.toLowerCase().endsWith(`.${extension}`) &&
    parts.suffix === undefined
  ) {
    base = base.slice(0, -(extension.length + 1)) || FALLBACK_SEGMENT;
  }
  return escapeWindowsReserved(`${base}${tail}`);
}

/** Splits "name.ext" into parts; dotfiles and names without a plausible extension keep it all. */
export function splitExtension(fileName: string): { base: string; extension: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return { base: fileName, extension: '' };
  const extension = sanitizeExtension(fileName.slice(dot + 1));
  return extension === ''
    ? { base: fileName, extension: '' }
    : { base: fileName.slice(0, dot), extension };
}
