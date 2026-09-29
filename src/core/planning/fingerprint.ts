/**
 * What identifies one version of a file. The URL revision exists but is 0 on the real site
 * (MOODLE-NOTES H2), so size, Last-Modified and ETag carry the change detection.
 */
export interface Fingerprint {
  /** pluginfile path without host and revision-independent parts kept as-is. */
  readonly path: string;
  readonly revision: number | null;
  readonly size: number | null;
  readonly lastModified: string | null;
  readonly etag: string | null;
  readonly contentType: string | null;
}

export interface FingerprintSource {
  readonly ref: { readonly path: string; readonly revision: number | null };
  readonly size: number | null;
  readonly lastModified: string | null;
  readonly etag: string | null;
  readonly contentType: string | null;
}

export function fingerprintOf(file: FingerprintSource): Fingerprint {
  return {
    path: file.ref.path,
    revision: file.ref.revision,
    size: file.size,
    lastModified: file.lastModified,
    etag: file.etag,
    contentType: file.contentType,
  };
}

/** Path with the revision segment removed, so a new revision alone does not look like a new file. */
function stablePath(fp: Fingerprint): string {
  return fp.revision === null ? fp.path : fp.path.replace(`/content/${fp.revision}/`, '/content/');
}

const differs = <T>(a: T | null, b: T | null) => a !== null && b !== null && a !== b;

/**
 * True when the server now serves different content. Fields unknown on either side are
 * ignored; with nothing comparable the file is treated as unchanged (no endless re-downloads).
 */
export function hasChanged(previous: Fingerprint, current: Fingerprint): boolean {
  return (
    stablePath(previous) !== stablePath(current) ||
    differs(previous.revision, current.revision) ||
    differs(previous.size, current.size) ||
    differs(previous.etag, current.etag) ||
    differs(previous.lastModified, current.lastModified)
  );
}
