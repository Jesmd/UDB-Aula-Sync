const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** "1,2 MB" (Spanish decimal comma); `unknown` when the size is not known. */
export function formatBytes(bytes: number | null, unknown: string, locale = 'es'): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return unknown;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${UNITS[unit] ?? 'B'}`;
}

/** "PDF", "PPTX"… from the real extension; the content type when there is none. */
export function typeLabel(extension: string, contentType: string | null, unknown: string): string {
  if (extension !== '') return extension.toUpperCase();
  const mime = contentType?.split(';')[0]?.trim() ?? '';
  return mime === '' ? unknown : mime;
}
