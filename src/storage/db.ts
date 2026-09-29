import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Fingerprint } from '../core/planning/fingerprint';
import type { CourseSnapshot } from '../core/planning/snapshot-diff';
import type { Task } from '../core/queue/task';
import { DB_VERSION, runMigrations } from './migrations';

/** One downloaded file. Stores ids, names and fingerprints only, never page HTML (spec §8). */
export interface FileRecord {
  /** `${courseId}:${cmid}:${fileKey}` */
  readonly id: string;
  readonly courseId: number;
  readonly cmid: number;
  readonly fileKey: string;
  readonly fingerprint: Fingerprint;
  readonly url: string;
  readonly relativePath: string;
  /** Absolute path reported by the browser; null until known. */
  readonly localPath: string | null;
  readonly downloadId: number | null;
  readonly versions: number;
  readonly downloadedAt: number;
}

export interface MetaRecord {
  readonly key: string;
  readonly value: unknown;
}

export interface UdbSyncDb extends DBSchema {
  files: { key: string; value: FileRecord; indexes: { byCourse: number; byPath: string } };
  tasks: { key: string; value: Task; indexes: { byState: string } };
  snapshots: { key: number; value: CourseSnapshot };
  meta: { key: string; value: MetaRecord };
}

export const DB_NAME = 'udbsync';

let opening: Promise<IDBPDatabase<UdbSyncDb>> | undefined;

/** Shared connection per context; migrations run on first open. */
export function openDatabase(name = DB_NAME): Promise<IDBPDatabase<UdbSyncDb>> {
  if (name !== DB_NAME) {
    return openDB<UdbSyncDb>(name, DB_VERSION, {
      upgrade: (db, o, n, tx) => {
        runMigrations(db, o, n, tx);
      },
    });
  }
  opening ??= openDB<UdbSyncDb>(name, DB_VERSION, {
    upgrade: (db, oldVersion, newVersion, tx) => {
      runMigrations(db, oldVersion, newVersion, tx);
    },
    // Another context upgraded the schema: drop our handle so the next call reopens.
    blocking: () => {
      void opening?.then((db) => {
        db.close();
      });
      opening = undefined;
    },
  });
  return opening;
}
