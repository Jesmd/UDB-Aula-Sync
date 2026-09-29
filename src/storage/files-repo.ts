import type { IDBPDatabase } from 'idb';
import type { FileRecord, UdbSyncDb } from './db';

export interface FilesRepo {
  get(id: string): Promise<FileRecord | undefined>;
  put(record: FileRecord): Promise<void>;
  listAll(): Promise<FileRecord[]>;
  listByCourse(courseId: number): Promise<FileRecord[]>;
  /** Records at this relative path, compared case-insensitively (Windows paths are). */
  findByPath(relativePath: string): Promise<FileRecord[]>;
}

const samePath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function createFilesRepo(db: IDBPDatabase<UdbSyncDb>): FilesRepo {
  return {
    get: (id) => db.get('files', id),
    put: async (record) => {
      await db.put('files', record);
    },
    listAll: () => db.getAll('files'),
    listByCourse: (courseId) => db.getAllFromIndex('files', 'byCourse', courseId),
    // The index only matches exact case; a course of a few hundred files scans fast.
    findByPath: async (relativePath) =>
      (await db.getAll('files')).filter((r) => samePath(r.relativePath, relativePath)),
  };
}

/** In-memory repo with the same contract, for tests. */
export function createMemoryFilesRepo(): FilesRepo {
  const files = new Map<string, FileRecord>();
  return {
    get: (id) => Promise.resolve(files.get(id)),
    put: (record) => {
      files.set(record.id, record);
      return Promise.resolve();
    },
    listAll: () => Promise.resolve([...files.values()]),
    listByCourse: (courseId) =>
      Promise.resolve([...files.values()].filter((r) => r.courseId === courseId)),
    findByPath: (relativePath) =>
      Promise.resolve([...files.values()].filter((r) => samePath(r.relativePath, relativePath))),
  };
}
