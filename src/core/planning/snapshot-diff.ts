/**
 * Course snapshots for "novedades" (spec §3.4): what the course showed at the last sync.
 * Only ids, names and availability, never page HTML (spec §8).
 */

export const SNAPSHOT_VERSION = 1;

export interface SnapshotSection {
  /** Stable key: "n:<number>" or "name:<parent>/<name>" for tabs without a number. */
  readonly key: string;
  readonly name: string;
  readonly parent: string | null;
  readonly available: boolean;
}

export interface SnapshotItem {
  readonly cmid: number;
  readonly name: string;
  readonly sectionKey: string;
  readonly modname: string;
  readonly available: boolean;
  /** A resource or folder: may hold a file to download. */
  readonly downloadable: boolean;
}

export interface CourseSnapshot {
  readonly version: typeof SNAPSHOT_VERSION;
  readonly courseId: number;
  readonly takenAt: number;
  readonly sections: readonly SnapshotSection[];
  readonly items: readonly SnapshotItem[];
}

export type Novelty =
  | {
      readonly kind: 'item';
      readonly cmid: number;
      readonly name: string;
      readonly section: string;
      readonly since: number;
    }
  | {
      readonly kind: 'section';
      readonly key: string;
      readonly name: string;
      readonly since: number;
    };

export interface SnapshotDiff {
  /** Downloadable items that are new, or were there but could not be opened before. */
  readonly newItems: readonly SnapshotItem[];
  /** Sections that were dimmed or restricted and are open now. */
  readonly sectionsNowAvailable: readonly SnapshotSection[];
}

export function diffSnapshots(previous: CourseSnapshot, next: CourseSnapshot): SnapshotDiff {
  const before = new Map(previous.items.map((i) => [i.cmid, i]));
  const sectionsBefore = new Map(previous.sections.map((s) => [s.key, s]));
  return {
    newItems: next.items.filter((item) => {
      if (!item.downloadable || !item.available) return false;
      return before.get(item.cmid)?.available !== true;
    }),
    sectionsNowAvailable: next.sections.filter(
      (s) => s.available && sectionsBefore.get(s.key)?.available === false,
    ),
  };
}

/**
 * Novelties to show. A section that opened counts once when nothing downloadable came
 * with it; otherwise its new items already tell the story.
 */
export function noveltiesFrom(
  diff: SnapshotDiff,
  sections: readonly SnapshotSection[],
  now: number,
): Novelty[] {
  const names = new Map(sections.map((s) => [s.key, s.name]));
  const items: Novelty[] = diff.newItems.map((i) => ({
    kind: 'item',
    cmid: i.cmid,
    name: i.name,
    section: names.get(i.sectionKey) ?? '',
    since: now,
  }));
  const withItems = new Set(diff.newItems.map((i) => i.sectionKey));
  const opened: Novelty[] = diff.sectionsNowAvailable
    .filter((s) => !withItems.has(s.key))
    .map((s) => ({ kind: 'section', key: s.key, name: s.name, since: now }));
  return [...items, ...opened];
}

/** Adds fresh novelties to the pending ones without duplicates (older entry wins). */
export function mergeNovelties(pending: readonly Novelty[], fresh: readonly Novelty[]): Novelty[] {
  const id = (n: Novelty) => (n.kind === 'item' ? `i:${n.cmid}` : `s:${n.key}`);
  const seen = new Set(pending.map(id));
  return [...pending, ...fresh.filter((n) => !seen.has(id(n)))];
}
