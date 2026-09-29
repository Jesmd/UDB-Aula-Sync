import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type { UdbSyncDb } from './db';

type UpgradeTx = IDBPTransaction<UdbSyncDb, StoreNames<UdbSyncDb>[], 'versionchange'>;
type Migration = (db: IDBPDatabase<UdbSyncDb>, tx: UpgradeTx) => void;

/**
 * Ordered schema steps: MIGRATIONS[n] upgrades version n to n+1. Never edit a shipped
 * step; append a new one and bump DB_VERSION.
 */
export const MIGRATIONS: readonly Migration[] = [
  // 0 -> 1: files index, download tasks, course snapshots (M5), key-value meta.
  (db) => {
    const files = db.createObjectStore('files', { keyPath: 'id' });
    files.createIndex('byCourse', 'courseId');
    files.createIndex('byPath', 'relativePath');
    const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
    tasks.createIndex('byState', 'state');
    db.createObjectStore('snapshots', { keyPath: 'courseId' });
    db.createObjectStore('meta', { keyPath: 'key' });
  },
  // 1 -> 2: folder handle for the optional folder verifier (M6).
  (db) => {
    db.createObjectStore('handles');
  },
];

export const DB_VERSION = MIGRATIONS.length;

export function runMigrations(
  db: IDBPDatabase<UdbSyncDb>,
  oldVersion: number,
  newVersion: number | null,
  tx: UpgradeTx,
): void {
  const target = newVersion ?? DB_VERSION;
  for (let version = oldVersion; version < target; version++) {
    const step = MIGRATIONS[version];
    if (step === undefined) throw new Error(`missing migration ${version} -> ${version + 1}`);
    step(db, tx);
  }
}
