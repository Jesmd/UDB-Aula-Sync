/**
 * What the worker may know about the chosen folder: that there is one, its name and when it
 * was chosen. Stored in `meta`; the handle itself stays in the `handles` store.
 */
export const FOLDER_INFO_KEY = 'folder:info';

export interface FolderInfo {
  readonly name: string;
  readonly pickedAt: number;
}
