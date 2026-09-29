import type { IDBPDatabase } from 'idb';
import type { Task } from '../core/queue/task';
import type { UdbSyncDb } from './db';

export interface TasksRepo {
  get(id: string): Promise<Task | undefined>;
  put(task: Task): Promise<void>;
  all(): Promise<Task[]>;
  findByDownloadId(downloadId: number): Promise<Task | undefined>;
  remove(id: string): Promise<void>;
}

export function createTasksRepo(db: IDBPDatabase<UdbSyncDb>): TasksRepo {
  return {
    get: (id) => db.get('tasks', id),
    put: async (task) => {
      await db.put('tasks', task);
    },
    all: () => db.getAll('tasks'),
    findByDownloadId: async (downloadId) =>
      (await db.getAll('tasks')).find((t) => t.downloadId === downloadId),
    remove: (id) => db.delete('tasks', id),
  };
}

/** In-memory repo with the same contract, for tests. */
export function createMemoryTasksRepo(): TasksRepo {
  const tasks = new Map<string, Task>();
  return {
    get: (id) => Promise.resolve(tasks.get(id)),
    put: (task) => {
      tasks.set(task.id, task);
      return Promise.resolve();
    },
    all: () => Promise.resolve([...tasks.values()]),
    findByDownloadId: (downloadId) =>
      Promise.resolve([...tasks.values()].find((t) => t.downloadId === downloadId)),
    remove: (id) => {
      tasks.delete(id);
      return Promise.resolve();
    },
  };
}
