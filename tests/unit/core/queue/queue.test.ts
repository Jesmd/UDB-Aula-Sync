import { describe, expect, it } from 'vitest';
import { nextWakeAt, recoveryPlan, runnable } from '../../../../src/core/queue/scheduler';
import { transition, type TaskEvent } from '../../../../src/core/queue/state-machine';
import { createTask, taskId, type Task } from '../../../../src/core/queue/task';
import { appError } from '../../../../src/shared/errors';

const base = (cmid = 1, now = 0): Task =>
  createTask(
    {
      courseId: 7,
      cmid,
      fileKey: `mod_resource/content/f${cmid}.pdf`,
      request: {
        url: 'https://x/pluginfile.php/1/mod_resource/content/0/f.pdf',
        relativePath: 'UDB/f.pdf',
        conflictAction: 'uniquify',
        extension: 'pdf',
        expectedSize: 10,
        expectedType: 'application/pdf',
        open: false,
      },
      fingerprint: {
        path: '/p',
        revision: 0,
        size: 10,
        lastModified: null,
        etag: null,
        contentType: null,
      },
      reason: 'nuevo',
      versions: 1,
      originTabId: null,
    },
    now,
  );

const step = (task: Task, event: TaskEvent, now = 1) => {
  const result = transition(task, event, { now, random: () => 1 });
  if (!result.ok) throw new Error(result.error.detail);
  return result.value;
};

describe('task state machine', () => {
  it('walks the happy path', () => {
    const t0 = base();
    expect(t0).toMatchObject({
      id: taskId(7, 1, 'mod_resource/content/f1.pdf'),
      state: 'en_cola',
      attempts: 0,
    });
    const t1 = step(t0, { type: 'start' });
    const t2 = step(t1, { type: 'started', downloadId: 42 });
    const t3 = step(t2, { type: 'complete' });
    const t4 = step(t3, { type: 'verified' });
    expect([t1.state, t2.downloadId, t3.state, t4.state, t4.attempts]).toEqual([
      'descargando',
      42,
      'verificando',
      'hecha',
      1,
    ]);
  });

  it('requeues retryable failures with backoff and gives up on final ones', () => {
    const downloading = step(base(), { type: 'start' }, 1000);
    const retry = step(downloading, { type: 'failed', error: appError('network') }, 1000);
    expect(retry).toMatchObject({
      state: 'en_cola',
      nextAttemptAt: 2000,
      downloadId: null,
      lastError: { code: 'network' },
    });
    const final = step(downloading, { type: 'failed', error: appError('disk_full') });
    expect(final).toMatchObject({ state: 'fallida', nextAttemptAt: null });
    const again = step(final, { type: 'retry' });
    expect(again).toMatchObject({ state: 'en_cola', attempts: 0 });
    expect(step(again, { type: 'cancel' }).state).toBe('omitida');
    expect(step(step(downloading, { type: 'complete' }), { type: 'requeue' }).state).toBe(
      'en_cola',
    );
  });

  it('rejects impossible transitions', () => {
    const result = transition(base(), { type: 'verified' }, { now: 0 });
    expect(!result.ok && result.error).toEqual({
      code: 'invalid_transition',
      detail: 'verified from en_cola',
    });
  });
});

describe('scheduler', () => {
  it('fills free slots with due tasks, oldest first', () => {
    const active = step(base(1, 0), { type: 'start' });
    const waiting = { ...base(2, 5), nextAttemptAt: 10_000 };
    const due = [base(3, 3), base(4, 1), base(5, 2)];
    expect(runnable([active, waiting, ...due], 1_000, 2).map((t) => t.cmid)).toEqual([4]);
    expect(runnable([waiting, ...due], 1_000, 2).map((t) => t.cmid)).toEqual([4, 5]);
    expect(runnable([waiting], 20_000, 2).map((t) => t.cmid)).toEqual([2]);
    expect(nextWakeAt([active, waiting, ...due], 1_000)).toBe(10_000);
    expect(nextWakeAt(due, 1_000)).toBeNull();
  });

  it('plans recovery: follow known downloads, requeue the rest', () => {
    const following = step(step(base(1), { type: 'start' }), { type: 'started', downloadId: 9 });
    const lost = step(base(2), { type: 'start' });
    const verifying = step(following, { type: 'complete' });
    expect(
      recoveryPlan([following, lost, verifying, base(3)]).map((r) => [r.kind, r.task.cmid]),
    ).toEqual([
      ['follow', 1],
      ['requeue', 2],
      ['follow', 1],
    ]);
  });
});
