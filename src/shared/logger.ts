import { LOG_RING_SIZE } from './constants';
import type { LogEntry, LogLevel } from './types';

const REDACTIONS: readonly (readonly [RegExp, string])[] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
  [/(sesskey["'=:\s]+)[\w-]+/gi, '$1[redacted]'],
  [/(MoodleSession\w*["'=:\s]+)[\w-]+/gi, '$1[redacted]'],
  [/(token["'=:\s]+)[\w-]+/gi, '$1[redacted]'],
];

/** Removes personal data and secrets from free text before it is stored or exported. */
export function redact(text: string): string {
  return REDACTIONS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  );
}

export type LogSink = (entry: LogEntry) => void;

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  child(scope: string): Logger;
}

/** Bounded in-memory ring. Oldest entries are dropped first. */
export class LogRing {
  readonly #entries: LogEntry[] = [];

  constructor(readonly capacity: number = LOG_RING_SIZE) {}

  push(entry: LogEntry): void {
    this.#entries.push(entry);
    if (this.#entries.length > this.capacity) this.#entries.shift();
  }

  snapshot(): readonly LogEntry[] {
    return [...this.#entries];
  }

  clear(): void {
    this.#entries.length = 0;
  }
}

export interface LoggerOptions {
  readonly ring?: LogRing;
  readonly sinks?: readonly LogSink[];
  readonly now?: () => number;
  readonly minLevel?: LogLevel;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function createLogger(scope: string, options: LoggerOptions = {}): Logger {
  const ring = options.ring ?? new LogRing();
  const sinks = options.sinks ?? [];
  const now = options.now ?? Date.now;
  const minLevel = options.minLevel ?? 'debug';

  const write = (level: LogLevel, message: string): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const entry: LogEntry = { ts: now(), level, scope, message: redact(message) };
    ring.push(entry);
    for (const sink of sinks) sink(entry);
  };

  return {
    debug: (m) => {
      write('debug', m);
    },
    info: (m) => {
      write('info', m);
    },
    warn: (m) => {
      write('warn', m);
    },
    error: (m) => {
      write('error', m);
    },
    child: (childScope) => createLogger(`${scope}:${childScope}`, { ...options, ring }),
  };
}

export const consoleSink: LogSink = (entry) => {
  const line = `[udbsync:${entry.scope}] ${entry.message}`;
  if (entry.level === 'error') console.error(line);
  else if (entry.level === 'warn') console.warn(line);
  else console.debug(line);
};

/** Serializes entries for the "export logs" action. Entries are already redacted. */
export function exportLogs(entries: readonly LogEntry[]): string {
  return entries
    .map((e) => `${new Date(e.ts).toISOString()} ${e.level.toUpperCase()} ${e.scope} ${e.message}`)
    .join('\n');
}
