/** C0/C1 control characters and Unicode bidi/format controls that can disguise names. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

export function toNFC(text: string): string {
  return text.normalize('NFC');
}

export function stripControl(text: string): string {
  return text.replace(CONTROL, '');
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Length in code points, so a truncation never splits a surrogate pair. */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

export function truncateCodePoints(text: string, max: number): string {
  const points = Array.from(text);
  return points.length <= max ? text : points.slice(0, Math.max(0, max)).join('');
}
