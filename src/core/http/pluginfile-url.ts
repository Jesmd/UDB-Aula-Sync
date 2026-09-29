/**
 * Moodle file URLs: <root>/pluginfile.php/<contextid>/<component>/<filearea>/<itemid|rev>/<path...>/<file>.
 * mod_resource and mod_folder put a revision where other areas put an item id (H2, H6).
 */
export interface PluginfileRef {
  readonly contextId: number;
  readonly component: string;
  readonly filearea: string;
  /** Revision for mod_resource/mod_folder "content"; null when the URL has none. */
  readonly revision: number | null;
  /** Subfolders between the revision and the file name (mod_folder), decoded. */
  readonly filepath: readonly string[];
  readonly filename: string;
  /** Stable across revisions: component/filearea/path/file. Used as index key. */
  readonly fileKey: string;
  /** Path without host and query, used in fingerprints. */
  readonly path: string;
}

const REVISIONED = new Set(['mod_resource/content', 'mod_folder/content']);

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function pluginfilePath(url: URL): string | null {
  const marker = '/pluginfile.php/';
  const at = url.pathname.indexOf(marker);
  if (at !== -1) return url.pathname.slice(at + marker.length - 1);
  // slasharguments off: pluginfile.php?file=/ctx/...
  if (url.pathname.endsWith('/pluginfile.php')) return url.searchParams.get('file');
  return null;
}

export function isPluginfileUrl(url: string): boolean {
  return parsePluginfileUrl(url) !== null;
}

export function parsePluginfileUrl(raw: string): PluginfileRef | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const path = pluginfilePath(url);
  if (path === null) return null;
  const parts = path.split('/').filter((p) => p !== '');
  const [ctx, component, filearea, ...rest] = parts;
  if (ctx === undefined || !/^\d+$/.test(ctx) || component === undefined || filearea === undefined)
    return null;

  let revision: number | null = null;
  let tail = rest;
  if (
    REVISIONED.has(`${component}/${filearea}`) &&
    rest[0] !== undefined &&
    /^\d+$/.test(rest[0])
  ) {
    revision = Number(rest[0]);
    tail = rest.slice(1);
  }
  const decoded = tail.map(decode);
  // An encoded separator (%2F) must not smuggle a path into a single segment.
  if (
    decoded.length === 0 ||
    decoded.some((s) => s === null || s === '.' || s === '..' || /[/\\]/.test(s))
  ) {
    return null;
  }
  const segments = decoded as string[];
  const filename = segments.at(-1) ?? '';
  const filepath = segments.slice(0, -1);
  return {
    contextId: Number(ctx),
    component,
    filearea,
    revision,
    filepath,
    filename,
    fileKey: [component, filearea, ...filepath, filename].join('/'),
    path: `/pluginfile.php/${parts.join('/')}`,
  };
}

/** Same file URL without forcedownload/hash, so the stored URL is stable. */
export function canonicalFileUrl(raw: string): string {
  const url = new URL(raw);
  url.searchParams.delete('forcedownload');
  url.hash = '';
  return url.href;
}
