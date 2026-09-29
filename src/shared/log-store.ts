import type { LogSink } from './logger';
import type { LogEntry } from './types';

export const PERSISTED_LOG_SIZE = 300;
const KEY = 'logs';

export interface LogStorage {
  load(): Promise<LogEntry[]>;
  save(entries: readonly LogEntry[]): Promise<void>;
}

export const chromeLogStorage: LogStorage = {
  load: async () => {
    const stored = (await chrome.storage.local.get(KEY))[KEY] as unknown;
    return Array.isArray(stored) ? (stored as LogEntry[]) : [];
  },
  save: async (entries) => {
    await chrome.storage.local.set({ [KEY]: entries });
  },
};

/**
 * The worker's log survives its restarts (spec §8): info and above, already redacted,
 * the last 300 entries, written at most every 2 s.
 */
export class PersistentLog {
  #pending: LogEntry[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;
  #writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: LogStorage,
    private readonly delayMs = 2_000,
  ) {}

  readonly sink: LogSink = (entry) => {
    if (entry.level === 'debug') return;
    this.#pending.push(entry);
    this.#timer ??= setTimeout(() => {
      void this.flush();
    }, this.delayMs);
  };

  async flush(): Promise<void> {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    const batch = this.#pending;
    this.#pending = [];
    this.#writing = this.#writing.then(async () => {
      if (batch.length === 0) return;
      const stored = await this.storage.load();
      await this.storage.save([...stored, ...batch].slice(-PERSISTED_LOG_SIZE));
    });
    await this.#writing;
  }

  /** Stored entries plus the ones not written yet, oldest first. */
  async entries(): Promise<LogEntry[]> {
    await this.flush();
    return this.storage.load();
  }
}

/** Joins the stored log with this worker's ring, without duplicates, oldest first. */
export function mergeLogs(stored: readonly LogEntry[], ring: readonly LogEntry[]): LogEntry[] {
  const key = (e: LogEntry) => `${e.ts}|${e.level}|${e.scope}|${e.message}`;
  const seen = new Set<string>();
  return [...stored, ...ring]
    .filter((e) => {
      const k = key(e);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.ts - b.ts);
}
