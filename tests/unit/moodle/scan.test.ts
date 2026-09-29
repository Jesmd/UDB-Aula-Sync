import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveItems, scanCourse, type ScanDeps, type ScanItem } from '../../../src/moodle/scan';
import { startMockMoodle, type MockMoodle } from '../../mock-moodle/server';
import { courseUrl, loadFixture } from '../../helpers/fixtures';
import { jsdomParser } from '../../helpers/html-parser';

const ROOT = 'https://www.udbvirtual.edu.sv/auladigital/';

/** A page that renders one Onetopic section with one resource (cmid 9000 + section). */
function sectionPage(courseId: number, section: number): string {
  const cmid = 9000 + section;
  return `<!doctype html><body class="format-onetopic course-${courseId}"><div class="course-content"><ul class="topics">
    <li id="section-${section}" class="section main"><h3 class="sectionname">S${section}</h3><ul class="section img-text">
      <li class="activity resource modtype_resource" id="module-${cmid}"><a class="aalink" href="${ROOT}mod/resource/view.php?id=${cmid}"><span class="instancename">Archivo ${section}</span></a></li>
    </ul></li></ul></div></body>`;
}

function itemAt(items: readonly ScanItem[], index: number): ScanItem {
  const item = items[index];
  if (item === undefined) throw new Error(`no item ${index}`);
  return item;
}

function fakeFetch(respond: (url: URL) => { body: string; url?: string; status?: number }) {
  const calls: string[] = [];
  const fetch = vi.fn((input: string) => {
    calls.push(input);
    const r = respond(new URL(input));
    const response = new Response(r.body, {
      status: r.status ?? 200,
      headers: { 'content-type': 'text/html' },
    });
    return Promise.resolve(Object.defineProperty(response, 'url', { value: r.url ?? input }));
  });
  return { fetch, calls };
}

describe('scanCourse', () => {
  it('needs no request for a single-page course and skips unavailable or listed sections', async () => {
    const { fetch, calls } = fakeFetch(() => ({ body: '' }));
    const url = courseUrl(103);
    const result = await scanCourse(
      loadFixture('layouts/topics.html', url),
      url,
      { kind: 'course' },
      ['tema 2'],
      {
        fetch,
        parseHtml: jsdomParser,
      },
    );
    if (!result.ok) throw new Error(result.error.code);
    expect(calls).toEqual([]);
    expect(result.value.skipped.map((s) => s.name)).toEqual(['Tema 2', 'Tema 12']);
    expect(result.value.items.map((i) => i.activity.cmid)).toEqual([
      4001, 4002, 4101, 4102, 4301, 4302, 4401,
    ]);
  });

  it('fetches each available Onetopic tab once, never dimmed ones', async () => {
    const { fetch, calls } = fakeFetch((u) => ({
      body: sectionPage(102, Number(u.searchParams.get('section'))),
    }));
    const progress = vi.fn();
    const url = courseUrl(102, 15);
    const result = await scanCourse(
      loadFixture('layouts/onetopic-dimmed-tabs.html', url),
      url,
      { kind: 'course' },
      ['Recursos Bibliográficos'],
      {
        fetch,
        parseHtml: jsdomParser,
        onProgress: progress,
      },
    );
    if (!result.ok) throw new Error(result.error.code);
    // Organización, Inicio, Semana 1-11 (Semana 12 is this page; 13-19 dimmed; Recursos skipped).
    expect(calls).toHaveLength(13);
    expect(calls.every((c) => !/section=(16|17|18|19|20|21|22|3)$/.test(c))).toBe(true);
    expect(result.value.items).toHaveLength(13 + 6);
    expect(result.value.skipped.map((s) => s.name)).toEqual([
      'Semana 13',
      'Semana 14',
      'Semana 15',
      'Semana 16',
      'Semana 17',
      'Semana 18',
      'Semana 19',
      'Recursos Bibliográficos',
    ]);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'sections' }));
  });

  it('limits a section scope to those sections', async () => {
    const { fetch, calls } = fakeFetch((u) => ({
      body: sectionPage(102, Number(u.searchParams.get('section'))),
    }));
    const url = courseUrl(102, 15);
    const result = await scanCourse(
      loadFixture('layouts/onetopic-dimmed-tabs.html', url),
      url,
      { kind: 'sections', numbers: [15, 4] },
      [],
      {
        fetch,
        parseHtml: jsdomParser,
      },
    );
    expect(calls).toEqual([`${ROOT}course/view.php?id=102&section=4`]);
    expect(result.ok && result.value.items.map((i) => i.section.number)).toEqual([
      15, 15, 15, 15, 15, 15, 4,
    ]);
  });

  it('expands an inactive group tab into its subtabs', async () => {
    const url = courseUrl(49946, 2);
    // The real page: General (0) is a plain tab; fetching it shows its content.
    const { fetch } = fakeFetch((u) => ({
      body: sectionPage(49946, Number(u.searchParams.get('section'))),
    }));
    const result = await scanCourse(
      loadFixture('real/onetopic-2level-49946.html', url),
      url,
      { kind: 'course' },
      [],
      {
        fetch,
        parseHtml: jsdomParser,
      },
    );
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.sections.map((s) => s.number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.value.items).toHaveLength(2 + 9);
  });

  it('stops on a lost session and when cancelled', async () => {
    const url = courseUrl(102, 15);
    const doc = loadFixture('layouts/onetopic-dimmed-tabs.html', url);
    const expired = fakeFetch(() => ({
      body: '<body id="page-login-index"></body>',
      url: `${ROOT}login/index.php`,
    }));
    const result = await scanCourse(doc, url, { kind: 'course' }, [], {
      fetch: expired.fetch,
      parseHtml: jsdomParser,
    });
    expect(!result.ok && result.error.code).toBe('session_expired');
    expect(expired.calls).toHaveLength(1);

    const controller = new AbortController();
    controller.abort();
    const cancelled = await scanCourse(doc, url, { kind: 'course' }, [], {
      fetch: expired.fetch,
      parseHtml: jsdomParser,
      signal: controller.signal,
    });
    expect(!cancelled.ok && cancelled.error.code).toBe('cancelled');

    const failing = { fetch: () => Promise.reject(new Error('offline')), parseHtml: jsdomParser };
    const offline = await scanCourse(doc, url, { kind: 'course' }, [], failing);
    expect(!offline.ok && offline.error).toEqual({ code: 'network', detail: 'offline' });
  });

  it('reports pages that are not a course', async () => {
    const url = 'https://www.udbvirtual.edu.sv/auladigital/login/index.php';
    const { fetch } = fakeFetch(() => ({ body: '' }));
    const result = await scanCourse(
      loadFixture('auth/login-page.html', url),
      url,
      { kind: 'course' },
      [],
      { fetch, parseHtml: jsdomParser },
    );
    expect(!result.ok && result.error.code).toBe('session_expired');
  });
});

describe('resolveItems against the mock server', () => {
  let mock: MockMoodle;
  let deps: ScanDeps;
  beforeAll(async () => {
    mock = await startMockMoodle({ port: 0, tls: false });
    deps = {
      fetch: (input, init) => fetch(input.replace(ROOT, mock.root), init),
      parseHtml: jsdomParser,
    };
  });
  afterAll(async () => {
    await mock.close();
  });

  it('resolves resources and every file of a folder, and lists read-only items', async () => {
    const url = courseUrl(101, 14);
    const scan = await scanCourse(
      loadFixture('layouts/onetopic-2level.html', url),
      url,
      { kind: 'sections', numbers: [14] },
      [],
      deps,
    );
    if (!scan.ok) throw new Error(scan.error.code);
    const base = itemAt(scan.value.items, 1);
    const readonlyItem: ScanItem = { ...base, activity: { ...base.activity, cmid: 9001 } };
    const progress = vi.fn();
    const result = await resolveItems([...scan.value.items, readonlyItem], url, {
      ...deps,
      onProgress: progress,
    });
    if (!result.ok) throw new Error(result.error.code);
    expect(
      result.value.files.map((f) => [f.item.activity.cmid, f.folderPath, f.file.originalName]),
    ).toEqual([
      [2102, null, 'Presentación Semana 12.pptx'],
      [2103, null, 'Guía de ejercicios - TLC.pdf'],
      [2104, null, 'tabla_t.pdf'],
      [2106, ['Unidad 1'], 'ejercicio 1.pdf'],
      [2106, ['Unidad 1', 'Resueltos'], 'solución: 1.pdf'],
      [2106, [], 'tabla.xlsx'],
    ]);
    expect(result.value.readOnly.map((i) => i.activity.cmid)).toEqual([9001]);
    expect(progress).toHaveBeenLastCalledWith({ phase: 'files', done: 5, total: 5 });
  });

  it('records per-item failures and stops on a lost session', async () => {
    const url = courseUrl(101, 14);
    const scan = await scanCourse(
      loadFixture('layouts/onetopic-2level.html', url),
      url,
      { kind: 'sections', numbers: [14] },
      [],
      deps,
    );
    if (!scan.ok) throw new Error(scan.error.code);
    const base = itemAt(scan.value.items, 1);
    const missing: ScanItem = { ...base, activity: { ...base.activity, cmid: 123456 } };
    const partial = await resolveItems([missing], url, deps);
    expect(partial.ok && partial.value.failed.map((f) => f.error.code)).toEqual(['http_status']);
    mock.state.loggedIn = false;
    const expired = await resolveItems(scan.value.items, url, deps);
    mock.state.loggedIn = true;
    expect(!expired.ok && expired.error.code).toBe('session_expired');
  });
});
