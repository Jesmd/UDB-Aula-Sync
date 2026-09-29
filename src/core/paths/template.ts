import { appError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';

export const TEMPLATE_TOKENS = [
  'base',
  'curso',
  'cursoCorto',
  'materia',
  'anio',
  'ciclo',
  'grupo',
  'padre',
  'seccion',
  'actividad',
  'nombreOriginal',
  'ext',
  'archivo',
] as const;

export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];

export type TemplatePart = { readonly literal: string } | { readonly token: TemplateToken };

/** One path segment of a template: literal text and tokens. */
export type TemplateSegment = readonly TemplatePart[];

export const DEFAULT_TEMPLATE = '{base}/{curso}/{padre}/{seccion}/{archivo}';

const TOKEN = /\{([^{}]*)\}/g;

function isToken(name: string): name is TemplateToken {
  return (TEMPLATE_TOKENS as readonly string[]).includes(name);
}

/**
 * Validates a user template. Rules: relative, no "." or "..", only known tokens, and the
 * last segment is exactly "{archivo}" so every file lands under its own name.
 */
export function parseTemplate(template: string): Result<TemplateSegment[], AppError> {
  const raw = template.trim().replace(/\\/g, '/');
  if (raw === '' || raw.startsWith('/') || /^[a-z]:/i.test(raw)) {
    return err(appError('invalid_template', 'template must be a relative path'));
  }
  const segments: TemplateSegment[] = [];
  const pieces = raw.split('/');
  for (const [index, piece] of pieces.entries()) {
    if (piece === '' || piece === '.' || piece === '..') {
      return err(appError('invalid_template', `empty or dot segment at ${index}`));
    }
    const parts: TemplatePart[] = [];
    let last = 0;
    for (const match of piece.matchAll(TOKEN)) {
      const name = match[1] ?? '';
      if (!isToken(name)) return err(appError('invalid_template', `unknown token {${name}}`));
      if (match.index > last) parts.push({ literal: piece.slice(last, match.index) });
      parts.push({ token: name });
      last = match.index + match[0].length;
    }
    if (last < piece.length) parts.push({ literal: piece.slice(last) });
    if (parts.some((p) => 'literal' in p && /[{}]/.test(p.literal))) {
      return err(appError('invalid_template', 'unbalanced braces'));
    }
    segments.push(parts);
  }
  const final = segments.at(-1);
  const archivoOnly =
    final?.length === 1 &&
    final[0] !== undefined &&
    'token' in final[0] &&
    final[0].token === 'archivo';
  if (!archivoOnly) return err(appError('invalid_template', 'last segment must be {archivo}'));
  if (segments.slice(0, -1).some((s) => s.some((p) => 'token' in p && p.token === 'archivo'))) {
    return err(appError('invalid_template', '{archivo} only in the last segment'));
  }
  return ok(segments);
}

export type TemplateValues = Readonly<Partial<Record<TemplateToken, string | null>>>;

/**
 * Renders segments. A segment made only of tokens that are all empty is dropped, so
 * "{padre}" disappears for courses without tab groups. Values are NOT sanitized here.
 */
export function renderTemplate(
  segments: readonly TemplateSegment[],
  values: TemplateValues,
): string[] {
  const out: string[] = [];
  for (const segment of segments) {
    let text = '';
    let anyValue = false;
    for (const part of segment) {
      if ('literal' in part) {
        text += part.literal;
      } else {
        const value = values[part.token] ?? '';
        if (value !== '') anyValue = true;
        text += value;
      }
    }
    const onlyTokens = segment.every((p) => 'token' in p);
    if (onlyTokens ? anyValue : text.trim() !== '') out.push(text);
  }
  return out;
}
