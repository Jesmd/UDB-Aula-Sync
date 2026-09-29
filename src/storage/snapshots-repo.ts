import type { IDBPDatabase } from 'idb';
import {
  SNAPSHOT_VERSION,
  type CourseSnapshot,
  type Novelty,
} from '../core/planning/snapshot-diff';
import type { UdbSyncDb } from './db';
import type { MetaRepo } from './meta-repo';

/** Last known shape of each course (spec §3.4). A course without one is never synced alone. */
export interface SnapshotsRepo {
  get(courseId: number): Promise<CourseSnapshot | undefined>;
  put(snapshot: CourseSnapshot): Promise<void>;
  all(): Promise<CourseSnapshot[]>;
}

const current = (s: CourseSnapshot | undefined) =>
  s?.version === SNAPSHOT_VERSION ? s : undefined;

export function createSnapshotsRepo(db: IDBPDatabase<UdbSyncDb>): SnapshotsRepo {
  return {
    get: async (courseId) => current(await db.get('snapshots', courseId)),
    put: async (snapshot) => {
      await db.put('snapshots', snapshot);
    },
    all: async () => (await db.getAll('snapshots')).filter((s) => current(s) !== undefined),
  };
}

export function createMemorySnapshotsRepo(): SnapshotsRepo {
  const store = new Map<number, CourseSnapshot>();
  return {
    get: (courseId) => Promise.resolve(store.get(courseId)),
    put: (snapshot) => {
      store.set(snapshot.courseId, snapshot);
      return Promise.resolve();
    },
    all: () => Promise.resolve([...store.values()]),
  };
}

/** Pending novelties per course, until downloaded or marked as seen. */
export interface NoveltiesRepo {
  get(courseId: number): Promise<Novelty[]>;
  set(courseId: number, novelties: readonly Novelty[]): Promise<void>;
  all(): Promise<Map<number, Novelty[]>>;
  /** Drops one item (it was downloaded); true when something changed. */
  removeItem(courseId: number, cmid: number): Promise<boolean>;
  /** One course, or every course when null. */
  clear(courseId: number | null): Promise<void>;
}

const PREFIX = 'novelties:';

export function createNoveltiesRepo(meta: MetaRepo): NoveltiesRepo {
  const get = async (courseId: number) => (await meta.get<Novelty[]>(`${PREFIX}${courseId}`)) ?? [];
  const set = async (courseId: number, novelties: readonly Novelty[]) => {
    if (novelties.length === 0) await meta.delete(`${PREFIX}${courseId}`);
    else await meta.set(`${PREFIX}${courseId}`, novelties);
  };
  return {
    get,
    set,
    all: async () =>
      new Map(
        (await meta.list(PREFIX)).map(([key, value]) => [
          Number(key.slice(PREFIX.length)),
          value as Novelty[],
        ]),
      ),
    removeItem: async (courseId, cmid) => {
      const list = await get(courseId);
      const next = list.filter((n) => n.kind !== 'item' || n.cmid !== cmid);
      if (next.length === list.length) return false;
      await set(courseId, next);
      return true;
    },
    clear: async (courseId) => {
      const keys =
        courseId === null
          ? (await meta.list(PREFIX)).map(([key]) => key)
          : [`${PREFIX}${courseId}`];
      for (const key of keys) await meta.delete(key);
    },
  };
}
