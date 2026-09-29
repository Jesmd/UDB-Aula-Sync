import type { IDBPDatabase } from 'idb';
import type { UdbSyncDb } from './db';

/** Course names seen by the extension, for the popup (the index stores only ids). */
export interface CourseMeta {
  readonly id: number;
  readonly fullName: string;
  readonly shortName: string | null;
  readonly lastSeen: number;
}

export interface MetaRepo {
  putCourse(course: CourseMeta): Promise<void>;
  courses(): Promise<CourseMeta[]>;
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

const COURSE_PREFIX = 'course:';

export function createMetaRepo(db: IDBPDatabase<UdbSyncDb>): MetaRepo {
  return {
    putCourse: async (course) => {
      await db.put('meta', { key: `${COURSE_PREFIX}${course.id}`, value: course });
    },
    courses: async () =>
      (await db.getAll('meta'))
        .filter((m) => m.key.startsWith(COURSE_PREFIX))
        .map((m) => m.value as CourseMeta),
    get: async <T>(key: string) => (await db.get('meta', key))?.value as T | undefined,
    set: async (key, value) => {
      await db.put('meta', { key, value });
    },
  };
}

export function createMemoryMetaRepo(): MetaRepo {
  const values = new Map<string, unknown>();
  return {
    putCourse: (course) => {
      values.set(`${COURSE_PREFIX}${course.id}`, course);
      return Promise.resolve();
    },
    courses: () =>
      Promise.resolve(
        [...values].filter(([k]) => k.startsWith(COURSE_PREFIX)).map(([, v]) => v as CourseMeta),
      ),
    get: <T>(key: string) => Promise.resolve(values.get(key) as T | undefined),
    set: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
  };
}
