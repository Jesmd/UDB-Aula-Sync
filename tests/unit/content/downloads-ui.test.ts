// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadsUi } from '../../../src/content/downloads-ui';
import { mountUiRoot, ROOT_ID, type UiRoot } from '../../../src/content/ui/root';
import { setMessageLookup } from '../../../src/shared/i18n';
import type { DownloadRequestMessage, DownloadUpdateMessage } from '../../../src/shared/messages';
import { installChromeStub } from '../../helpers/chrome-stub';

const FILE_ID = '101:2102:mod_resource/content/a.pdf';

const request = {
  target: 'background',
  type: 'download/request',
  courseId: 101,
  cmid: 2102,
  course: { fullName: 'C', shortName: null },
  section: { name: 'S', parent: null, position: 1, numberWidth: 1 },
  activityName: 'Guía',
  file: {
    url: 'https://www.udbvirtual.edu.sv/auladigital/pluginfile.php/1/mod_resource/content/0/a.pdf',
    fileKey: 'mod_resource/content/a.pdf',
    path: '/p',
    revision: 0,
    originalName: 'a.pdf',
    extension: 'pdf',
    size: 1,
    lastModified: null,
    etag: null,
    contentType: null,
  },
  open: true,
} satisfies DownloadRequestMessage;

const update = (over: Partial<DownloadUpdateMessage>): DownloadUpdateMessage => ({
  target: 'content',
  type: 'content/download-update',
  event: 'task',
  fileId: FILE_ID,
  cmid: 2102,
  state: 'hecha',
  relativePath: 'UDB/C/S/Guía.pdf',
  outcome: null,
  errorCode: null,
  ...over,
});

let root: UiRoot;
let ui: DownloadsUi;
let send: ReturnType<typeof vi.fn>;

beforeEach(() => {
  installChromeStub();
  send = vi.fn();
  (chrome.runtime as unknown as { sendMessage: typeof send }).sendMessage = send;
  // Show keys and substitutions instead of translations.
  setMessageLookup((key, subs) =>
    [key, ...(Array.isArray(subs) ? subs : subs === undefined ? [] : [subs])].join('|'),
  );
  root = mountUiRoot(document, '');
  ui = new DownloadsUi(root);
});

afterEach(() => {
  setMessageLookup(undefined);
  document.getElementById(ROOT_ID)?.remove();
});

const toasts = () =>
  Array.from(root.layer.querySelectorAll('.udbsync-toast__text')).map((e) => e.textContent);
const buttons = () =>
  Array.from(root.layer.querySelectorAll('.udbsync-toast__action')).map((e) => e.textContent);

describe('DownloadsUi', () => {
  it('follows one file from queued to saved, with open/show buttons', async () => {
    send.mockResolvedValue({
      ok: true,
      value: {
        status: 'nuevo',
        action: 'queued',
        fileId: FILE_ID,
        relativePath: 'x',
        outcome: null,
      },
    });
    await ui.request(request, 'Guía');
    expect(toasts()).toEqual(['dlStarting|Guía']);
    ui.update(update({ state: 'hecha' }));
    expect(toasts()).toEqual(['dlSaved|UDB/C/S/Guía.pdf']);
    expect(buttons()).toEqual(['dlOpen', 'dlShow']);
    root.layer.querySelector<HTMLButtonElement>('.udbsync-toast__action')?.click();
    expect(send).toHaveBeenLastCalledWith({
      target: 'background',
      type: 'download/open',
      fileId: FILE_ID,
    });
    ui.update(update({ event: 'opened', outcome: 'opened' }));
    expect(toasts()).toEqual(['dlOpened|UDB/C/S/Guía.pdf']);
  });

  it('reports up-to-date files, skipped updates, failures, retries and errors', async () => {
    send.mockResolvedValueOnce({
      ok: true,
      value: {
        status: 'sin_cambios',
        action: 'opened',
        fileId: FILE_ID,
        relativePath: 'x',
        outcome: 'opened',
      },
    });
    await ui.request(request, 'Guía');
    expect(toasts()).toEqual(['dlUpToDate|Guía']);
    send.mockResolvedValueOnce({
      ok: true,
      value: {
        status: 'actualizado',
        action: 'opened',
        fileId: FILE_ID,
        relativePath: 'x',
        outcome: 'opened',
      },
    });
    await ui.request(request, 'Guía');
    expect(toasts()).toEqual(['dlUpdateSkipped|Guía']);
    ui.update(update({ state: 'en_cola', errorCode: 'network' }));
    expect(toasts()).toEqual(['dlRetrying|Guía']);
    ui.update(update({ state: 'fallida', errorCode: 'disk_full' }));
    expect(toasts()).toEqual(['dlFailed|Guía|error_disk_full']);
    send.mockResolvedValueOnce({ ok: false, error: { code: 'not_downloadable' } });
    await ui.request({ ...request, cmid: 9 }, 'Otro');
    expect(toasts()).toContain('dlFailed|Otro|error_not_downloadable');
  });

  it('tells about a lost session once, and about the save dialog', () => {
    ui.update(update({ event: 'session_expired', fileId: null, state: null }));
    ui.update(update({ event: 'session_expired', fileId: null, state: null }));
    ui.update(update({ event: 'save_dialog' }));
    ui.readOnly('Visor');
    expect(toasts()).toEqual(['error_session_expired', 'dlSaveDialog', 'dlReadOnly|Visor']);
  });
});
