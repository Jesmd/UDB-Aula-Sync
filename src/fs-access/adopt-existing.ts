import { sanitizeSegment } from '../core/text/sanitize-filename';
import { PATH_LIMITS } from '../shared/constants';
import { listingKey, type FolderListing, type LocalFile } from './scan-folder';

/** Base folder segments as buildPath writes them (sanitized). */
const baseSegments = (base: string) =>
  base
    .split(/[/\\]/)
    .filter((p) => p.trim() !== '')
    .map((p) => sanitizeSegment(p, PATH_LIMITS.segment));

/**
 * The chosen folder is the base folder (e.g. Descargas/UDB). Index paths start with the
 * base ("UDB/Curso/..."), so the base segments are dropped before looking a path up.
 * Returns null when the path is not under the base.
 */
export function pathInFolder(relativePath: string, base: string): string | null {
  const baseParts = baseSegments(base);
  const parts = relativePath.split('/');
  if (baseParts.length === 0 || parts.length <= baseParts.length) return null;
  const same = baseParts.every((b, i) => listingKey(b) === listingKey(parts[i] ?? ''));
  return same ? parts.slice(baseParts.length).join('/') : null;
}

/** The chosen folder should be the base folder itself; a different name is probably a mistake. */
export function folderMatchesBase(listing: Pick<FolderListing, 'rootName'>, base: string): boolean {
  const last = baseSegments(base).pop() ?? '';
  return listingKey(last) === listingKey(listing.rootName);
}

export function lookup(
  listing: FolderListing,
  relativePath: string,
  base: string,
): LocalFile | null | undefined {
  const inner = pathInFolder(relativePath, base);
  if (inner === null) return undefined;
  return listing.files.get(listingKey(inner)) ?? null;
}

/**
 * Whether a file we downloaded is still there. null = cannot tell: path outside the base,
 * a truncated scan, or a download newer than the scan.
 */
export function existsInFolder(
  listing: FolderListing,
  relativePath: string,
  base: string,
  downloadedAt: number,
): boolean | null {
  if (downloadedAt >= listing.takenAt) return null;
  const found = lookup(listing, relativePath, base);
  if (found === undefined) return null;
  if (found === null) return listing.truncated ? null : false;
  return true;
}

/**
 * A file we never downloaded already sits where we would save it, with the server's size:
 * adopt it ("ya_existe") instead of downloading a second copy. Unknown sizes never adopt.
 */
export function canAdopt(
  listing: FolderListing,
  relativePath: string,
  base: string,
  expectedSize: number | null,
): boolean {
  if (expectedSize === null) return false;
  const found = lookup(listing, relativePath, base);
  return found?.size === expectedSize;
}
