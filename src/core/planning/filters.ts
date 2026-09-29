export interface FileFilters {
  readonly excludedExtensions: readonly string[];
  readonly maxSizeMb: number | null;
}

export type FilterReason = 'extension' | 'size';

/** Why a file is left out ("omitido"), or null to keep it. Unknown sizes are kept. */
export function filterReason(
  file: { readonly extension: string; readonly size: number | null },
  filters: FileFilters,
): FilterReason | null {
  if (file.extension !== '' && filters.excludedExtensions.includes(file.extension.toLowerCase()))
    return 'extension';
  if (
    filters.maxSizeMb !== null &&
    file.size !== null &&
    file.size > filters.maxSizeMb * 1024 * 1024
  )
    return 'size';
  return null;
}

/** Section names to skip, compared without case, accents or surrounding spaces. */
export function isSkippedSection(name: string, skip: readonly string[]): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
  const target = norm(name);
  return skip.some((s) => norm(s) === target);
}
