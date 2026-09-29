import {
  diffSnapshots,
  mergeNovelties,
  noveltiesFrom,
  type CourseSnapshot,
  type Novelty,
} from '../core/planning/snapshot-diff';
import type { AppError } from '../shared/errors';
import type { Logger } from '../shared/logger';
import type {
  CourseSyncResult,
  DownloadPayload,
  SyncStatus,
  SyncSummary,
} from '../shared/messages';
import type { Result } from '../shared/result';
import type { FilesRepo } from '../storage/files-repo';
import type { MetaRepo } from '../storage/meta-repo';
import { courseSettings, type Settings } from '../storage/settings-schema';
import type { NoveltiesRepo, SnapshotsRepo } from '../storage/snapshots-repo';

export type SyncTrigger = 'alarm' | 'manual' | 'resume';

export interface NoveltyNotice {
  readonly courseId: number;
  readonly name: string;
  readonly count: number;
}

export interface CourseSyncDeps {
  readonly snapshots: SnapshotsRepo;
  readonly novelties: NoveltiesRepo;
  readonly files: FilesRepo;
  readonly meta: MetaRepo;
  readonly settings: () => Promise<Settings>;
  /** Scans one course in the offscreen document. */
  readonly scan: (
    courseId: number,
    known: readonly number[],
    skipSections: readonly string[],
  ) => Promise<Result<CourseSyncResult, AppError>>;
  /** Queues one file (download/request without a tab). */
  readonly download: (payload: DownloadPayload) => Promise<boolean>;
  readonly online: () => boolean;
  readonly screenLocked: () => Promise<boolean>;
  /** Downloads are running: a periodic run waits so requests stay at 2 at once (spec §2). */
  readonly busy: () => Promise<boolean>;
  readonly badge: (count: number) => void;
  readonly notifyNovelties: (notices: readonly NoveltyNotice[]) => void;
  readonly notifySessionLost: () => void;
  readonly log: Logger;
  readonly now?: () => number;
}

const KEYS = {
  lastRunAt: 'sync:lastRunAt',
  sessionLost: 'sync:sessionLost',
  pending: 'sync:pending',
} as const;

/** Downloadable items the last snapshot already knew and could open. */
const knownCmids = (s: CourseSnapshot) =>
  s.items.filter((i) => i.downloadable && i.available).map((i) => i.cmid);

/**
 * Novedades (spec §3.4). Only courses synced once by hand have a snapshot, and only those
 * are checked in the background. Each run scans them one by one in the offscreen document,
 * diffs against the snapshot, keeps the novelties until downloaded or seen, and queues
 * them when the course has "descargar novedades automáticamente". A lost session stops
 * the run, sends one notification and holds every background run until a logged-in page
 * is seen: zero requests meanwhile.
 */
export class CourseSync {
  #running = false;

  constructor(private readonly deps: CourseSyncDeps) {}

  get running(): boolean {
    return this.#running;
  }

  async status(): Promise<SyncStatus> {
    return {
      tracked: (await this.deps.snapshots.all()).map((s) => s.courseId),
      lastRunAt: (await this.deps.meta.get<number>(KEYS.lastRunAt)) ?? null,
      running: this.#running,
      sessionLost: (await this.deps.meta.get<boolean>(KEYS.sessionLost)) === true,
    };
  }

  async run(trigger: SyncTrigger): Promise<SyncSummary> {
    const summary = (
      skipped: SyncSummary['skipped'],
      extra: Partial<SyncSummary> = {},
    ): SyncSummary => ({
      courses: 0,
      novelties: 0,
      queued: 0,
      skipped,
      errorCode: null,
      ...extra,
    });
    if (this.#running) return summary('running');
    if (trigger !== 'manual' && (await this.deps.meta.get<boolean>(KEYS.sessionLost)) === true)
      return summary('session_lost');
    if (!this.deps.online()) {
      await this.deps.meta.set(KEYS.pending, true);
      return summary('offline');
    }
    if (trigger !== 'manual' && (await this.deps.screenLocked())) {
      await this.deps.meta.set(KEYS.pending, true);
      return summary('locked');
    }
    if (trigger !== 'manual' && (await this.deps.busy())) {
      await this.deps.meta.set(KEYS.pending, true);
      return summary('busy');
    }
    const snapshots = await this.deps.snapshots.all();
    if (snapshots.length === 0) return summary('no_courses');

    this.#running = true;
    try {
      return await this.#runAll(snapshots);
    } finally {
      this.#running = false;
    }
  }

  async #runAll(snapshots: readonly CourseSnapshot[]): Promise<SyncSummary> {
    const { deps } = this;
    const now = deps.now ?? Date.now;
    const settings = await deps.settings();
    const courseNames = new Map(
      (await deps.meta.list('course:')).map(([, v]) => {
        const c = v as { id: number; fullName: string };
        return [c.id, c.fullName];
      }),
    );
    const notices: NoveltyNotice[] = [];
    let courses = 0;
    let queued = 0;
    let errorCode: string | null = null;

    for (const previous of snapshots) {
      const { override } = courseSettings(settings, previous.courseId);
      const result = await deps.scan(
        previous.courseId,
        knownCmids(previous),
        override.skipSections,
      );
      if (!result.ok) {
        errorCode = result.error.code;
        if (result.error.code === 'session_expired') {
          await this.sessionLost();
          break;
        }
        deps.log.warn(`sync of course ${previous.courseId} failed: ${result.error.code}`);
        continue;
      }
      courses += 1;
      const next = result.value.snapshot;
      const indexed = new Set(
        (await deps.files.listByCourse(previous.courseId)).map((f) => f.cmid),
      );
      const fresh = noveltiesFrom(diffSnapshots(previous, next), next.sections, now()).filter(
        (n) => n.kind !== 'item' || !indexed.has(n.cmid),
      );
      const pending = await deps.novelties.get(previous.courseId);
      const merged = mergeNovelties(pending, fresh);
      await deps.novelties.set(previous.courseId, merged);
      await deps.snapshots.put(next);
      const added = merged.length - pending.length;
      if (added > 0)
        notices.push({
          courseId: previous.courseId,
          name: courseNames.get(previous.courseId) ?? `#${previous.courseId}`,
          count: added,
        });

      if (override.autoDownload) {
        const cmids = new Set(fresh.flatMap((n) => (n.kind === 'item' ? [n.cmid] : [])));
        for (const payload of result.value.files) {
          if (cmids.has(payload.cmid) && (await deps.download(payload))) queued += 1;
        }
      }
    }

    if (courses > 0) await this.sessionAlive();
    await deps.meta.set(KEYS.lastRunAt, now());
    await deps.meta.set(KEYS.pending, false);
    await this.refreshBadge();
    if (notices.length > 0) deps.notifyNovelties(notices);
    return {
      courses,
      novelties: notices.reduce((n, c) => n + c.count, 0),
      queued,
      skipped: null,
      errorCode,
    };
  }

  /** The screen unlocked, the network came back or downloads ended: run a sync put off. */
  async resumePending(): Promise<SyncSummary | null> {
    if ((await this.deps.meta.get<boolean>(KEYS.pending)) !== true) return null;
    return this.run('resume');
  }

  /** From the page: a full scan done by hand. The first one starts tracking the course. */
  async saveSnapshot(snapshot: CourseSnapshot): Promise<void> {
    await this.deps.snapshots.put(snapshot);
    await this.sessionAlive();
  }

  /** One notification per lost session, from a sync or from the download queue. */
  async sessionLost(): Promise<void> {
    if ((await this.deps.meta.get<boolean>(KEYS.sessionLost)) === true) return;
    await this.deps.meta.set(KEYS.sessionLost, true);
    this.deps.notifySessionLost();
  }

  /** A logged-in Aula Digital page loaded: background runs may continue. */
  async sessionAlive(): Promise<void> {
    if ((await this.deps.meta.get<boolean>(KEYS.sessionLost)) === true)
      await this.deps.meta.set(KEYS.sessionLost, false);
  }

  /** A file was downloaded: it is no longer new. */
  async downloaded(courseId: number, cmid: number): Promise<void> {
    if (await this.deps.novelties.removeItem(courseId, cmid)) await this.refreshBadge();
  }

  async clear(courseId: number | null): Promise<void> {
    await this.deps.novelties.clear(courseId);
    await this.refreshBadge();
  }

  async noveltiesByCourse(): Promise<Record<string, Novelty[]>> {
    return Object.fromEntries(
      [...(await this.deps.novelties.all())].map(([id, list]) => [String(id), list]),
    );
  }

  async refreshBadge(): Promise<void> {
    let count = 0;
    for (const list of (await this.deps.novelties.all()).values()) count += list.length;
    this.deps.badge(count);
  }
}
