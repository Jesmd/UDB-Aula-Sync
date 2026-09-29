import { describe, expect, it, vi } from 'vitest';
import { consoleSink, createLogger, exportLogs, LogRing, redact } from '../../../src/shared/logger';

describe('redact', () => {
  it('removes emails, sesskey, session cookies and tokens', () => {
    const input =
      'user ana.perez@udb.edu.sv sesskey=Ab12Cd MoodleSession=xyz789 token: tk_1 "sesskey":"q1"';
    const out = redact(input);
    expect(out).not.toMatch(/ana\.perez|Ab12Cd|xyz789|tk_1|q1/);
    expect(out).toContain('[email]');
    expect(out).toContain('sesskey=[redacted]');
  });
});

describe('LogRing', () => {
  it('drops the oldest entries past capacity', () => {
    const ring = new LogRing(2);
    for (const message of ['a', 'b', 'c']) ring.push({ ts: 0, level: 'info', scope: 's', message });
    expect(ring.snapshot().map((e) => e.message)).toEqual(['b', 'c']);
    ring.clear();
    expect(ring.snapshot()).toEqual([]);
  });
});

describe('createLogger', () => {
  it('writes redacted entries to ring and sinks, honoring minLevel', () => {
    const ring = new LogRing();
    const sink = vi.fn();
    const log = createLogger('bg', { ring, sinks: [sink], now: () => 1000, minLevel: 'info' });
    log.debug('hidden');
    log.info('mail a@b.co');
    log.warn('w');
    log.error('e');
    log.child('sync').info('nested');
    expect(ring.snapshot()).toEqual([
      { ts: 1000, level: 'info', scope: 'bg', message: 'mail [email]' },
      { ts: 1000, level: 'warn', scope: 'bg', message: 'w' },
      { ts: 1000, level: 'error', scope: 'bg', message: 'e' },
      { ts: 1000, level: 'info', scope: 'bg:sync', message: 'nested' },
    ]);
    expect(sink).toHaveBeenCalledTimes(4);
  });

  it('exports one line per entry', () => {
    const text = exportLogs([{ ts: 0, level: 'warn', scope: 'x', message: 'm' }]);
    expect(text).toBe('1970-01-01T00:00:00.000Z WARN x m');
  });

  it('routes console output by level', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    consoleSink({ ts: 0, level: 'error', scope: 's', message: 'e' });
    consoleSink({ ts: 0, level: 'warn', scope: 's', message: 'w' });
    consoleSink({ ts: 0, level: 'info', scope: 's', message: 'i' });
    expect(error).toHaveBeenCalledWith('[udbsync:s] e');
    expect(warn).toHaveBeenCalledWith('[udbsync:s] w');
    expect(debug).toHaveBeenCalledWith('[udbsync:s] i');
    vi.restoreAllMocks();
  });
});
