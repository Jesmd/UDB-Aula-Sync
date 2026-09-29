// @vitest-environment jsdom
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkRunner } from '../../../src/content/bulk';
import { PageContext } from '../../../src/content/page-context';
import { PageStatus, pillFor } from '../../../src/content/page-status';
import { CoursePanel, type PlanView } from '../../../src/content/ui/course-panel';
import { formatBytes, typeLabel } from '../../../src/content/ui/format';
import { DetailsCard } from '../../../src/content/ui/hover-card';
import { mountUiRoot, OVERLAY_ID, type UiRoot } from '../../../src/content/ui/root';
import { StatusPills, type PillStatus } from '../../../src/content/ui/status-badge';
import { setMessageLookup } from '../../../src/shared/i18n';
import type {
  DownloadPreviewResponse,
  DownloadRequestMessage,
  RuntimeMessage,
} from '../../../src/shared/messages';
import { DEFAULT_SETTINGS } from '../../../src/storage/settings-schema';
import { courseUrl, readFixture } from '../../helpers/fixtures';
import { installChromeStub } from '../../helpers/chrome-stub';
import { jsdomParser } from '../../helpers/html-parser';
import { startMockMoodle, type MockMoodle } from '../../mock-moodle/server';

const ROOT = 'https://www.udbvirtual.edu.sv/auladigital/';
const URL_101 = courseUrl(101, 14);
const LABELS: Record<PillStatus, string> = {
  nuevo: 'Nuevo',
  descargado: 'Descargado',
  actualizado: 'Actualizado',
  solo_lectura: 'Solo lectura',
  perdido_local: 'No está en disco',
  omitido: 'Omitido',
  error: 'Error',
};
const PANEL_LABELS = {
  open: 'Descargas',
  title: 'Descargas del curso',
  hint: 'h',
  section: 'Sección',
  all: 'Todo',
  onlyNew: 'Solo nuevos',
  retry: 'Reintentar',
  cancel: 'Cancelar',
  close: 'Cerrar',
  planTitle: 'Plan',
};

let doc: Document;
let overlay: UiRoot;
let send: ReturnType<typeof vi.fn<(message: RuntimeMessage) => Promise<unknown>>>;

function loadPage(): void {
  doc = new JSDOM(readFixture('layouts/onetopic-2level.html'), {
    url: URL_101,
    pretendToBeVisual: true,
  }).window.document;
  overlay = mountUiRoot(doc, '', OVERLAY_ID);
}

const pills = () => [...overlay.layer.querySelectorAll<HTMLElement>('.udbsync-pill')];
const pillsByCmid = (): Record<string, string | undefined> =>
  Object.fromEntries(pills().map((p) => [p.dataset.cmid ?? '', p.dataset.status]));

beforeEach(() => {
  installChromeStub();
  send = vi.fn<(message: RuntimeMessage) => Promise<unknown>>();
  (chrome.runtime as unknown as { sendMessage: typeof send }).sendMessage = send;
  setMessageLookup((key, subs) =>
    [key, ...(Array.isArray(subs) ? subs : subs === undefined ? [] : [subs])].join('|'),
  );
  loadPage();
});

describe('format', () => {
  it('prints sizes and types', () => {
    expect(formatBytes(null, '?')).toBe('?');
    expect(typeLabel('pdf', 'application/pdf', '?')).toBe('PDF');
    expect(typeLabel('', 'text/plain; charset=utf-8', '?')).toBe('text/plain');
    expect(typeLabel('', null, '?')).toBe('?');
  });
});

describe('StatusPills and PageStatus', () => {
  it('maps index statuses to pills', () => {
    expect(pillFor('sin_cambios')).toBe('descargado');
    expect(pillFor('ya_existe')).toBe('descargado');
    expect(pillFor('nuevo')).toBe('nuevo');
  });

  it('draws one text-only pill per file in the overlay and removes it on null', () => {
    const statusPills = new StatusPills(overlay, doc, { ...LABELS, nuevo: '<b>Nuevo</b>' });
    statusPills.set(2102, 'nuevo');
    statusPills.set(2102, 'nuevo');
    statusPills.set(424242, 'nuevo'); // not on this page: no pill
    expect(pills()).toHaveLength(1);
    expect(pills()[0]?.textContent).toBe('<b>Nuevo</b>');
    expect(pills()[0]?.querySelector('b')).toBeNull();
    // The page itself is untouched (no layout shift).
    expect(doc.querySelector('#module-2102 .udbsync-pill')).toBeNull();
    statusPills.set(2102, null);
    expect(pills()).toHaveLength(0);
  });

  it('loads the index, follows previews and downloads, and respects the switch', async () => {
    let enabled = true;
    const status = new PageStatus(new StatusPills(overlay, doc, LABELS), () => enabled);
    send.mockResolvedValue({
      ok: true,
      value: {
        files: [
          { fileId: 'a', cmid: 2102, relativePath: 'x', downloadedAt: 1, localExists: true },
          { fileId: 'b', cmid: 2103, relativePath: 'y', downloadedAt: 1, localExists: false },
        ],
      },
    });
    await status.load(101);
    expect(send).toHaveBeenCalledWith({
      target: 'background',
      type: 'files/status',
      courseId: 101,
    });
    const byCmid = pillsByCmid;
    expect(byCmid()).toEqual({ 2102: 'descargado', 2103: 'perdido_local' });

    const preview: DownloadPreviewResponse = {
      fileId: 'c',
      status: 'actualizado',
      willDownload: true,
      relativePath: 'z',
      size: 3,
      omitted: null,
    };
    status.onPreview(2104, preview);
    status.onReadOnly(2105);
    status.onFailed(2103);
    expect(status.preview(2104)).toBe(preview);
    expect(byCmid()).toMatchObject({ 2104: 'actualizado', 2103: 'error' });
    status.onDownloaded(2104);
    expect(status.preview(2104)).toBeUndefined();
    expect(byCmid()[2104]).toBe('descargado');

    enabled = false;
    status.refresh();
    expect(pills()).toHaveLength(0);
    send.mockClear();
    await status.load(101);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('CoursePanel', () => {
  const view = (over: Partial<PlanView> = {}): PlanView => ({
    rows: [['Nuevos', 3]],
    total: '3 archivos',
    note: null,
    warning: null,
    confirmLabel: 'Descargar 3',
    ...over,
  });

  function panel() {
    const handlers = {
      onSection: vi.fn(),
      onAll: vi.fn(),
      onNew: vi.fn(),
      onRetry: vi.fn(),
      onCancel: vi.fn(),
    };
    return { handlers, panel: new CoursePanel(overlay, PANEL_LABELS, handlers) };
  }

  it('opens from the button, closes with Escape and returns focus', () => {
    const { panel: p, handlers } = panel();
    const fab = overlay.layer.querySelector<HTMLButtonElement>('.udbsync-fab');
    fab?.click();
    expect(p.isOpen).toBe(true);
    expect(fab?.getAttribute('aria-expanded')).toBe('true');
    const buttons = [...p.element.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Sección',
      'Todo',
      'Solo nuevos',
      'Reintentar',
      'Cancelar',
      'Cerrar',
    ]);
    buttons[1]?.click();
    expect(handlers.onAll).toHaveBeenCalledOnce();
    p.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(p.isOpen).toBe(false);
    expect(overlay.shadow.activeElement).toBe(fab);
  });

  it('starts small plans at once and waits for confirmation on big ones', async () => {
    const { panel: p } = panel();
    await expect(p.showPlan(view(), false)).resolves.toBe(true);
    await expect(p.showPlan(view({ confirmLabel: null }), true)).resolves.toBe(false);

    const big = p.showPlan(view({ warning: 'Grande' }), true);
    expect(p.element.textContent).toContain('Grande');
    const confirm = [...p.element.querySelectorAll('button')].find(
      (b) => b.textContent === 'Descargar 3',
    );
    confirm?.click();
    await expect(big).resolves.toBe(true);

    const cancelled = p.showPlan(view(), true);
    p.setBusy(true);
    [...p.element.querySelectorAll('button')].find((b) => b.textContent === 'Cancelar')?.click();
    await expect(cancelled).resolves.toBe(false);
  });

  it('shows progress and disables the actions while busy', () => {
    const { panel: p } = panel();
    p.setBusy(true);
    p.setStatus('2 de 5', { done: 2, total: 5 });
    const progress = p.element.querySelector('progress');
    expect(progress?.hidden).toBe(false);
    expect(progress?.value).toBe(2);
    expect(p.element.querySelector('button')?.disabled).toBe(true);
    p.setStatus('listo');
    expect(progress?.hidden).toBe(true);
  });
});

describe('DetailsCard', () => {
  it('renders course text as text and swaps the open frame', () => {
    const card = new DetailsCard(overlay, {
      type: 'Tipo',
      file: 'Archivo',
      size: 'Tamaño',
      destination: 'Destino',
      status: 'Estado',
      download: 'Descargar',
      copy: 'Copiar ruta',
      copied: 'Copiada',
      openFrameTitle: 'Abrir',
    });
    const onDownload = vi.fn();
    const anchor = doc.querySelector('#module-2102 a');
    if (anchor === null) throw new Error('fixture');
    const data = {
      name: '<img src=x onerror=alert(1)>',
      type: 'PDF',
      fileName: 'a.pdf',
      size: '1 KB',
      destination: 'UDB/C/S/a.pdf',
      status: 'Nuevo',
      openFrameUrl: null,
      canDownload: true,
    };
    card.show(anchor, data, { onDownload, onCopy: () => Promise.resolve() });
    expect(card.visible).toBe(true);
    expect(card.element.querySelector('img')).toBeNull();
    expect(card.element.textContent).toContain('<img src=x onerror=alert(1)>');
    [...card.element.querySelectorAll('button')]
      .find((b) => b.textContent === 'Descargar')
      ?.click();
    expect(onDownload).toHaveBeenCalledOnce();

    card.update({ ...data, openFrameUrl: 'chrome-extension://id/open?f=1', canDownload: false });
    expect(card.element.querySelectorAll('iframe')).toHaveLength(1);
    card.update({ ...data, openFrameUrl: 'chrome-extension://id/open?f=1', canDownload: false });
    expect(card.element.querySelectorAll('iframe')).toHaveLength(1);
    card.update(data);
    expect(card.element.querySelector('iframe')).toBeNull();
    card.hide();
    expect(card.visible).toBe(false);
  });
});

describe('BulkRunner against the mock server', () => {
  let mock: MockMoodle;
  beforeAll(async () => {
    mock = await startMockMoodle({ port: 0, tls: false });
  });
  afterAll(async () => {
    await mock.close();
  });

  /** Worker stub: previews say "nuevo" except cmid 2103 (already downloaded). */
  function worker(requests: DownloadRequestMessage[]) {
    send.mockImplementation((message: RuntimeMessage) => {
      if (message.type === 'download/preview') {
        const fileId = `${message.cmid}:${message.file.originalName}`;
        const known = message.cmid === 2103;
        return Promise.resolve({
          ok: true,
          value: {
            fileId,
            status: known ? 'sin_cambios' : 'nuevo',
            willDownload: !known,
            relativePath: `UDB/${message.file.originalName}`,
            size: message.file.size,
            omitted: null,
          },
        });
      }
      if (message.type === 'download/request') {
        requests.push(message);
        return Promise.resolve({
          ok: true,
          value: {
            status: 'nuevo',
            action: 'queued',
            fileId: `${message.cmid}:${message.file.originalName}`,
            relativePath: null,
            outcome: null,
          },
        });
      }
      return Promise.resolve({ ok: true, value: { retried: 0 } });
    });
  }

  function runner() {
    const panel = new CoursePanel(overlay, PANEL_LABELS, {
      onSection: vi.fn(),
      onAll: vi.fn(),
      onNew: vi.fn(),
      onRetry: vi.fn(),
      onCancel: vi.fn(),
    });
    const status = new PageStatus(new StatusPills(overlay, doc, LABELS), () => true);
    const bulk = new BulkRunner({
      doc,
      url: () => URL_101,
      context: new PageContext(doc, () => URL_101),
      panel,
      status,
      fetch: (input, init) => fetch(input.replace(ROOT, mock.root), init),
      parseHtml: jsdomParser,
      settings: () => DEFAULT_SETTINGS,
    });
    return { bulk, panel };
  }

  it('downloads the section’s new files after a small plan, folder files with their subpath', async () => {
    const requests: DownloadRequestMessage[] = [];
    worker(requests);
    const { bulk, panel } = runner();
    await bulk.run('section');
    expect(requests.map((r) => [r.cmid, r.file.originalName, r.folderPath])).toEqual([
      [2102, 'Presentación Semana 12.pptx', null],
      [2104, 'tabla_t.pdf', null],
      [2106, 'ejercicio 1.pdf', ['Unidad 1']],
      [2106, 'solución: 1.pdf', ['Unidad 1', 'Resueltos']],
      [2106, 'tabla.xlsx', []],
    ]);
    expect(requests.every((r) => !r.open && r.courseId === 101)).toBe(true);
    // Status pills for resources on the page; the known file stays "descargado".
    expect(pillsByCmid()).toMatchObject({ 2102: 'nuevo', 2103: 'descargado', 2104: 'nuevo' });

    // Progress follows the worker's updates; ones from other runs are not ours.
    for (const r of requests) {
      const mine = bulk.handleUpdate({
        target: 'content',
        type: 'content/download-update',
        event: 'task',
        fileId: `${r.cmid}:${r.file.originalName}`,
        cmid: r.cmid,
        state: r.cmid === 2104 ? 'fallida' : 'hecha',
        relativePath: null,
        outcome: null,
        errorCode: null,
      });
      expect(mine).toBe(true);
    }
    expect(
      bulk.handleUpdate({
        target: 'content',
        type: 'content/download-update',
        event: 'task',
        fileId: 'other',
        cmid: 1,
        state: 'hecha',
        relativePath: null,
        outcome: null,
        errorCode: null,
      }),
    ).toBe(false);
    expect(panel.element.textContent).toContain('bulkDone|4|1');
    expect(bulk.running).toBe(false);
  });

  it('stops before any download when the session is lost', async () => {
    const requests: DownloadRequestMessage[] = [];
    worker(requests);
    mock.state.loggedIn = false;
    const { bulk, panel } = runner();
    await bulk.run('new');
    mock.state.loggedIn = true;
    expect(requests).toEqual([]);
    expect(panel.element.textContent).toContain('error_session_expired');
    expect(send.mock.calls.some(([m]) => m.type === 'download/preview')).toBe(false);
  });
});
