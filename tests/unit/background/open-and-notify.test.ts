import { describe, expect, it } from 'vitest';
import { interruptError } from '../../../src/background/download-manager';
import { updateMessage } from '../../../src/background/notifications';
import { openDecision, safeOpen } from '../../../src/background/safe-open';
import { createTask } from '../../../src/core/queue/task';
import { parseMessage } from '../../../src/shared/messages';
import { FakeDownloads } from '../../helpers/fake-downloads';

describe('safe open', () => {
  it('opens only allowlisted document types', () => {
    for (const ext of ['pdf', 'PPTX', 'docx', 'xlsx', 'txt', 'csv', 'png', 'jpg'])
      expect(openDecision(ext), ext).toBe('open');
    for (const ext of ['exe', 'js', 'docm', 'xlsm', 'pptm', 'zip', 'rar', 'pkt', ''])
      expect(openDecision(ext), ext).toBe('show');
  });

  it('opens, shows, or reports a blocked open', async () => {
    const backend = new FakeDownloads();
    expect(await safeOpen(backend, 1, 'pdf')).toBe('opened');
    expect(await safeOpen(backend, 2, 'zip')).toBe('shown');
    backend.openBlocked = true;
    expect(await safeOpen(backend, 3, 'pdf')).toBe('blocked');
    expect([backend.opened, backend.shown]).toEqual([[1], [2]]);
  });
});

describe('interrupt reasons', () => {
  it.each([
    ['FILE_NO_SPACE', 'disk_full'],
    ['USER_CANCELED', 'cancelled'],
    ['SERVER_FORBIDDEN', 'session_expired'],
    ['FILE_BLOCKED', 'file_rejected'],
    ['FILE_NAME_TOO_LONG', 'file_rejected'],
    ['NETWORK_TIMEOUT', 'download_interrupted'],
    [undefined, 'download_interrupted'],
  ])('%s -> %s', (reason, code) => {
    expect(interruptError(reason).code).toBe(code);
  });
});

describe('tab updates', () => {
  it('builds messages the content script accepts', () => {
    const task = createTask(
      {
        courseId: 1,
        cmid: 2,
        fileKey: 'mod_resource/content/a.pdf',
        request: {
          url: 'u',
          relativePath: 'UDB/a.pdf',
          conflictAction: 'uniquify',
          extension: 'pdf',
          expectedSize: null,
          expectedType: null,
          open: true,
        },
        fingerprint: {
          path: '/p',
          revision: 0,
          size: null,
          lastModified: null,
          etag: null,
          contentType: null,
        },
        reason: 'nuevo',
        versions: 1,
        originTabId: 4,
      },
      0,
    );
    for (const event of [
      { type: 'task', task } as const,
      { type: 'opened', task, outcome: 'blocked' } as const,
      { type: 'save_dialog', task } as const,
      { type: 'session_expired' } as const,
    ]) {
      const message = updateMessage(event);
      expect(parseMessage(message).ok, event.type).toBe(true);
    }
    expect(updateMessage({ type: 'opened', task, outcome: 'blocked' })).toMatchObject({
      fileId: '1:2:mod_resource/content/a.pdf',
      relativePath: 'UDB/a.pdf',
      outcome: 'blocked',
      state: 'en_cola',
    });
  });
});
