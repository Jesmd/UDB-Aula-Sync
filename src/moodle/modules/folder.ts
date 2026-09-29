import {
  canonicalFileUrl,
  parsePluginfileUrl,
  type PluginfileRef,
} from '../../core/http/pluginfile-url';
import { absoluteUrl, queryAll } from '../dom';
import { SELECTORS } from '../selectors';

export interface FolderFile {
  readonly url: string;
  readonly ref: PluginfileRef;
  /** Subfolders inside the folder, from the file URL (not from the tree markup). */
  readonly folderPath: readonly string[];
  readonly fileName: string;
}

export function folderViewUrl(moodleRoot: string, cmid: number): string {
  const url = new URL('mod/folder/view.php', moodleRoot);
  url.searchParams.set('id', String(cmid));
  return url.href;
}

/**
 * Lists the files of a mod_folder page (H6). Structure comes from the pluginfile path, so
 * any tree markup works. Folder URLs carry no reliable per-file revision: fingerprints use
 * size and date (M3).
 */
export function parseFolderPage(doc: Document, baseUrl: string): FolderFile[] {
  const files = new Map<string, FolderFile>();
  for (const link of queryAll(doc, SELECTORS.folderFileLink)) {
    const url = absoluteUrl(link.getAttribute('href'), baseUrl);
    const ref = url === null ? null : parsePluginfileUrl(url);
    if (url === null || ref === null || files.has(ref.fileKey)) continue;
    files.set(ref.fileKey, {
      url: canonicalFileUrl(url),
      ref,
      folderPath: ref.filepath,
      fileName: ref.filename,
    });
  }
  return [...files.values()];
}
