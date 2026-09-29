import { appError, type AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';
import type { IDBPDatabase } from 'idb';
import type { UdbSyncDb } from '../storage/db';
import type { DirLike } from './scan-folder';

/** File System Access calls not in lib.dom yet (Chromium only). */
export interface FolderHandle extends DirLike {
  queryPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
}

interface PickerWindow {
  showDirectoryPicker?(options: {
    id?: string;
    mode?: 'read';
    startIn?: 'downloads';
  }): Promise<FolderHandle>;
}

export type FolderPermission = PermissionState | 'unsupported';

const HANDLE_KEY = 'base';

export interface HandleStore {
  get(): Promise<FolderHandle | undefined>;
  set(handle: FolderHandle): Promise<void>;
  clear(): Promise<void>;
}

/** The handle lives in IndexedDB (structured clone); the browser may ask again per session. */
export function createHandleStore(db: IDBPDatabase<UdbSyncDb>): HandleStore {
  return {
    get: async () => (await db.get('handles', HANDLE_KEY)) as FolderHandle | undefined,
    set: async (handle) => {
      await db.put('handles', handle, HANDLE_KEY);
    },
    clear: async () => {
      await db.delete('handles', HANDLE_KEY);
    },
  };
}

export function createMemoryHandleStore(initial?: FolderHandle): HandleStore {
  let handle = initial;
  return {
    get: () => Promise.resolve(handle),
    set: (next) => {
      handle = next;
      return Promise.resolve();
    },
    clear: () => {
      handle = undefined;
      return Promise.resolve();
    },
  };
}

/** Read permission. `request` needs a user click (options page); never ask for write. */
export async function folderPermission(
  handle: FolderHandle,
  request = false,
): Promise<FolderPermission> {
  const descriptor = { mode: 'read' } as const;
  try {
    const state = request
      ? await handle.requestPermission?.(descriptor)
      : await handle.queryPermission?.(descriptor);
    return state ?? 'unsupported';
  } catch {
    return 'denied';
  }
}

export function pickerAvailable(win: object): boolean {
  return typeof (win as PickerWindow).showDirectoryPicker === 'function';
}

/**
 * Lets the user pick the base folder, read-only. Chromium refuses some folders (the home
 * folder, Descargas itself), so the user picks the dedicated subfolder (Descargas/UDB).
 */
export async function pickFolder(win: object): Promise<Result<FolderHandle, AppError>> {
  const picker = win as PickerWindow;
  if (picker.showDirectoryPicker === undefined)
    return err(appError('folder_permission', 'no directory picker'));
  try {
    return ok(
      await picker.showDirectoryPicker({ id: 'udbsync-base', mode: 'read', startIn: 'downloads' }),
    );
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : '';
    if (name === 'AbortError') return err(appError('cancelled', 'picker closed'));
    return err(appError('folder_permission', cause instanceof Error ? cause.message : name));
  }
}
