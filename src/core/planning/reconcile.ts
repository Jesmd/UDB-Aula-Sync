import type { FileStatus, UpdatePolicy } from '../../shared/types';
import { hasChanged, type Fingerprint } from './fingerprint';

/** What the index remembers about a downloaded file. */
export interface IndexedVersion {
  readonly fingerprint: Fingerprint;
  /** Local versions kept so far (for the " (rev N)" suffix of "conservar ambas"). */
  readonly versions: number;
}

export type ConflictAction = 'uniquify' | 'overwrite';

export type Decision =
  | { readonly status: FileStatus; readonly action: 'skip' }
  | {
      readonly status: FileStatus;
      readonly action: 'download';
      readonly conflictAction: ConflictAction;
      /** "conservar ambas": suffix for the new copy, e.g. " (rev 2)"; null keeps the path. */
      readonly versionSuffix: string | null;
    };

/**
 * Compares the server's file with the index and the local copy, and applies the update
 * policy. `localExists` is null when unknown (chrome.downloads.search can be stale).
 * Local files are never deleted; "sobrescribir" replaces only our own earlier download.
 */
export function reconcile(
  entry: IndexedVersion | null,
  current: Fingerprint,
  localExists: boolean | null,
  policy: UpdatePolicy,
): Decision {
  if (entry === null) {
    // A same-named file we never downloaded may exist: never overwrite it.
    return { status: 'nuevo', action: 'download', conflictAction: 'uniquify', versionSuffix: null };
  }
  if (localExists === false) {
    return {
      status: 'perdido_local',
      action: 'download',
      conflictAction: 'overwrite',
      versionSuffix: null,
    };
  }
  if (!hasChanged(entry.fingerprint, current)) return { status: 'sin_cambios', action: 'skip' };

  switch (policy) {
    case 'omitir':
      return { status: 'actualizado', action: 'skip' };
    case 'sobrescribir':
      return {
        status: 'actualizado',
        action: 'download',
        conflictAction: 'overwrite',
        versionSuffix: null,
      };
    case 'conservar_ambas':
      return {
        status: 'actualizado',
        action: 'download',
        conflictAction: 'uniquify',
        versionSuffix: ` (rev ${entry.versions + 1})`,
      };
  }
}
