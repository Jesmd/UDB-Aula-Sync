import type { FolderListing } from '../fs-access/scan-folder';
import type { AppError } from '../shared/errors';
import type { Logger } from '../shared/logger';
import type { Result } from '../shared/result';

export interface FolderVerifierDeps {
  /** True once the user chose a folder in Options (a flag in meta, never the handle). */
  readonly configured: () => Promise<boolean>;
  /** Reads the folder in the offscreen document. */
  readonly scan: () => Promise<Result<FolderListing, AppError>>;
  readonly log: Logger;
  readonly now?: () => number;
  readonly maxAgeMs?: number;
}

/**
 * Optional folder verifier (spec §5 b, M6). Keeps the last listing for a minute so a
 * burst of previews reads the folder once. Any problem (no folder, no permission) means
 * "unknown": callers fall back to chrome.downloads.search.
 */
export class FolderVerifier {
  #listing: FolderListing | null = null;
  #checkedAt = -Infinity;
  #running: Promise<FolderListing | null> | null = null;

  constructor(private readonly deps: FolderVerifierDeps) {}

  async listing(): Promise<FolderListing | null> {
    const now = (this.deps.now ?? Date.now)();
    if (now - this.#checkedAt < (this.deps.maxAgeMs ?? 60_000)) return this.#listing;
    this.#running ??= this.#load().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  /** Scans now (Options > "Comprobar"). */
  async refresh(): Promise<Result<FolderListing, AppError>> {
    const result = await this.deps.scan();
    this.#listing = result.ok ? result.value : null;
    this.#checkedAt = (this.deps.now ?? Date.now)();
    return result;
  }

  async #load(): Promise<FolderListing | null> {
    if (!(await this.deps.configured())) {
      this.#listing = null;
      this.#checkedAt = (this.deps.now ?? Date.now)();
      return null;
    }
    const result = await this.refresh();
    if (!result.ok) this.deps.log.warn(`folder scan failed: ${result.error.code}`);
    return this.#listing;
  }
}
