import { describe, expect, it, vi } from 'vitest';
import { mergeLogs, PersistentLog, PERSISTED_LOG_SIZE } from '../../../src/shared/log-store';
import { errorMessage } from '../../../src/shared/error-text';
import { setMessageLookup } from '../../../src/shared/i18n';
import { createLogger } from '../../../src/shared/logger';
import type { LogEntry } from '../../../src/shared/types';

function memoryStorage() {
  let stored: LogEntry[] = [];
  return {
    load: vi.fn(() => Promise.resolve([...stored])),
    save: vi.fn((entries: readonly LogEntry[]) => {
      stored = [...entries];
      return Promise.resolve();
    }),
    get stored() {
      return stored;
    },
  };
}

describe('PersistentLog', () => {
  it('keeps info and above, redacted, capped, written in batches', async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const persistent = new PersistentLog(storage, 2_000);
    let now = 0;
    const log = createLogger('bg', { sinks: [persistent.sink], now: () => now++ });
    log.debug('noise');
    log.info('sync ana@udb.edu.sv sesskey=abc123');
    log.error('boom');
    expect(storage.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.stored.map((e) => e.message)).toEqual([
      'sync [email] sesskey=[redacted]',
      'boom',
    ]);
    for (let i = 0; i < PERSISTED_LOG_SIZE + 10; i++) log.warn(`w${i}`);
    const entries = await persistent.entries();
    expect(entries).toHaveLength(PERSISTED_LOG_SIZE);
    expect(entries.at(-1)?.message).toBe(`w${PERSISTED_LOG_SIZE + 9}`);
    vi.useRealTimers();
  });

  it('merges stored and in-memory entries without duplicates', () => {
    const a: LogEntry = { ts: 1, level: 'info', scope: 's', message: 'a' };
    const b: LogEntry = { ts: 2, level: 'warn', scope: 's', message: 'b' };
    expect(mergeLogs([b, a], [a])).toEqual([a, b]);
  });
});

describe('errorMessage', () => {
  it('names known codes and falls back for anything else', () => {
    setMessageLookup((key) => key);
    expect(errorMessage('session_expired')).toBe('error_session_expired');
    expect(errorMessage('made_up')).toBe('error_unknown');
    expect(errorMessage(null)).toBe('error_unknown');
    setMessageLookup(undefined);
  });
});
