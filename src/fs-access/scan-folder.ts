import { appError, type AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';

/**
 * The part of FileSystemDirectoryHandle the scan uses. Real handles fit it; tests pass
 * plain objects.
 */
export interface DirLike {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncIterable<DirLike | FileLike>;
}

export interface FileLike {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<{ readonly size: number; readonly lastModified: number }>;
}

export interface LocalFile {
  readonly size: number;
  readonly lastModified: number;
}

/** Files under the chosen folder, keyed by lower-case "/"-separated path (Windows ignores case). */
export interface FolderListing {
  readonly rootName: string;
  readonly takenAt: number;
  readonly files: ReadonlyMap<string, LocalFile>;
  /** The scan stopped at a limit: absence proves nothing. */
  readonly truncated: boolean;
}

export const SCAN_LIMITS = { maxEntries: 20_000, maxDepth: 12 } as const;

export const listingKey = (path: string): string => path.normalize('NFC').toLowerCase();

/**
 * Walks the folder read-only (spec §5 b). Never follows more than `maxDepth` levels or
 * `maxEntries` entries; a folder that cannot be read ends the scan with an error.
 */
export async function scanFolder(
  root: DirLike,
  now: number,
  limits: { readonly maxEntries: number; readonly maxDepth: number } = SCAN_LIMITS,
): Promise<Result<FolderListing, AppError>> {
  const files = new Map<string, LocalFile>();
  let entries = 0;
  let truncated = false;
  let full = false;
  const walk = async (dir: DirLike, prefix: string, depth: number): Promise<void> => {
    for await (const entry of dir.values()) {
      if (++entries > limits.maxEntries) {
        truncated = full = true;
        return;
      }
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        files.set(listingKey(path), { size: file.size, lastModified: file.lastModified });
      } else if (depth < limits.maxDepth) {
        await walk(entry, path, depth + 1);
      } else {
        truncated = true;
      }
      if (full) return;
    }
  };
  try {
    await walk(root, '', 1);
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : '';
    return err(
      appError(
        name === 'NotAllowedError' || name === 'SecurityError' ? 'folder_permission' : 'storage',
        cause instanceof Error ? cause.message : String(cause),
      ),
    );
  }
  return ok({ rootName: root.name, takenAt: now, files, truncated });
}
