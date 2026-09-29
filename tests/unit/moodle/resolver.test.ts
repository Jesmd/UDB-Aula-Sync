import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPath } from '../../../src/core/paths/build-path';
import { folderViewUrl, parseFolderPage } from '../../../src/moodle/modules/folder';
import { findResourceFileUrl } from '../../../src/moodle/resolver/embed-parser';
import { probeHeaders } from '../../../src/moodle/resolver/head-probe';
import {
  resolveFileUrl,
  resolveResource,
  type ResolvedFile,
  type ResolveDeps,
} from '../../../src/moodle/resolver/resolve-chain';
import { startMockMoodle, type MockMoodle } from '../../mock-moodle/server';
import { loadFixture } from '../../helpers/fixtures';
import { jsdomParser } from '../../helpers/html-parser';

let mock: MockMoodle;
let deps: ResolveDeps;

beforeAll(async () => {
  mock = await startMockMoodle({ port: 0, tls: false });
  deps = {
    fetch: (input, init) => fetch(input, init),
    parseHtml: jsdomParser,
    moodleRoot: mock.root,
  };
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => {
  mock.state.requests.length = 0;
  mock.state.loggedIn = true;
});

async function file(cmid: number): Promise<ResolvedFile> {
  const result = await resolveResource(cmid, deps);
  if (!result.ok) throw new Error(result.error.code);
  if (result.value.kind !== 'file') throw new Error('readonly');
  return result.value.file;
}

describe('resolveResource against the mock server', () => {
  it('H1: follows redirect=1 to pluginfile with one view request, reading only headers', async () => {
    const f = await file(2102);
    expect(f).toMatchObject({
      via: 'redirect',
      originalName: 'Presentación Semana 12.pptx',
      extension: 'pptx',
      size: 245_760,
      lastModified: 'Mon, 14 Sep 2026 15:00:00 GMT',
      ref: { contextId: 5101, revision: 1, filename: 'Presentación Semana 12.pptx' },
    });
    expect(f.url).toMatch(
      /\/pluginfile\.php\/5101\/mod_resource\/content\/1\/Presentaci%C3%B3n%20Semana%2012\.pptx$/,
    );
    expect(mock.state.requests).toEqual([
      'GET /auladigital/mod/resource/view.php?id=2102&redirect=1',
      'GET /auladigital/pluginfile.php/5101/mod_resource/content/1/Presentaci%C3%B3n%20Semana%2012.pptx',
    ]);
  });

  it('finds an embedded file and reads filename* (RFC 5987)', async () => {
    expect(await file(2103)).toMatchObject({
      via: 'embed',
      originalName: 'Guía de ejercicios - TLC.pdf',
      extension: 'pdf',
    });
  });

  it('H4 fallback: GET when HEAD is refused; name from the URL without forcedownload', async () => {
    const f = await file(2104);
    expect(f).toMatchObject({
      via: 'embed',
      originalName: 'tabla_t.pdf',
      extension: 'pdf',
      size: 12_000,
    });
    expect(f.url).not.toContain('forcedownload');
    expect(mock.state.requests.filter((r) => r.startsWith('HEAD'))).toHaveLength(1);
  });

  it('leaves the extension empty for generic content types without a name extension', async () => {
    expect(await file(3106)).toMatchObject({
      originalName: 'Simulación',
      extension: '',
      contentType: 'application/octet-stream',
    });
  });

  it('reports read-only resources and does nothing else', async () => {
    const result = await resolveResource(9001, deps);
    expect(result).toEqual({ ok: true, value: { kind: 'readonly' } });
    expect(mock.state.requests).toHaveLength(1);
  });

  it('sees a new revision', async () => {
    const seed = mock.state.resources.get(2102);
    if (seed === undefined) throw new Error();
    seed.revision = 2;
    expect((await file(2102)).ref.revision).toBe(2);
    seed.revision = 1;
  });

  it('maps throttling, expired sessions, missing items and network failures', async () => {
    expect(await resolveResource(9002, deps)).toEqual({
      ok: false,
      error: { code: 'rate_limited', detail: 'retry-after=1' },
    });
    mock.state.loggedIn = false;
    expect(await resolveResource(2102, deps)).toEqual({
      ok: false,
      error: { code: 'session_expired' },
    });
    mock.state.loggedIn = true;
    expect(await resolveResource(123456, deps)).toEqual({
      ok: false,
      error: { code: 'http_status', detail: '404' },
    });
    const failing = { ...deps, fetch: () => Promise.reject(new TypeError('Failed to fetch')) };
    expect(await resolveResource(2102, failing)).toEqual({
      ok: false,
      error: { code: 'network', detail: 'Failed to fetch' },
    });
    expect(await resolveFileUrl(`${mock.root}pluginfile.php/1/x/y/z.pdf`, failing)).toMatchObject({
      ok: false,
      error: { code: 'network' },
    });
  });

  it('treats a non-HTML, non-file answer as read-only', async () => {
    const fake = {
      ...deps,
      fetch: () =>
        Promise.resolve(
          Object.defineProperty(
            new Response('x', { headers: { 'content-type': 'application/json' } }),
            'url',
            { value: `${mock.root}mod/resource/view.php?id=1` },
          ),
        ),
    };
    expect(await resolveResource(1, fake)).toEqual({ ok: true, value: { kind: 'readonly' } });
  });
});

describe('mod_folder (H6 shape)', () => {
  it('lists files with subfolders from the page and resolves each', async () => {
    const response = await fetch(folderViewUrl(mock.root, 2106));
    const files = parseFolderPage(jsdomParser(await response.text()), response.url);
    expect(files.map((f) => [f.folderPath, f.fileName, f.ref.revision])).toEqual([
      [['Unidad 1'], 'ejercicio 1.pdf', 4],
      [['Unidad 1', 'Resueltos'], 'solución: 1.pdf', 4],
      [[], 'tabla.xlsx', 4],
    ]);
    const resolved = await resolveFileUrl(files[1]?.url ?? '', deps);
    expect(resolved.ok && resolved.value.kind === 'file' && resolved.value.file.originalName).toBe(
      'solución: 1.pdf',
    );
  });

  it('parses the tree fixture and ignores duplicates and non-folder links', () => {
    const url = 'https://www.udbvirtual.edu.sv/auladigital/mod/folder/view.php?id=2106';
    const files = parseFolderPage(loadFixture('modules/folder-tree.html', url), url);
    expect(files.map((f) => [...f.folderPath, f.fileName].join('/'))).toEqual([
      'Unidad 1/ejercicio 1.pdf',
      'Unidad 1/Resueltos/solucion: 1.pdf',
      'tabla.xlsx',
    ]);
    expect(files[0]?.url).not.toContain('forcedownload');
  });
});

describe('embed parser fixtures', () => {
  const url = 'https://www.udbvirtual.edu.sv/auladigital/mod/resource/view.php?id=1';
  it('finds object, workaround link, and nothing in a viewer-only page', () => {
    expect(findResourceFileUrl(loadFixture('modules/resource-embed-pdf.html', url), url)).toMatch(
      /mod_resource\/content\/2\/Gu%C3%ADa%203\.pdf$/,
    );
    expect(findResourceFileUrl(loadFixture('modules/resource-direct.html', url), url)).toMatch(
      /lab%20topologia\.pkt\?forcedownload=1$/,
    );
    expect(
      findResourceFileUrl(loadFixture('modules/resource-viewer-only.html', url), url),
    ).toBeNull();
  });
});

describe('probeHeaders', () => {
  it('uses HEAD when accepted and aborts GET after headers otherwise', async () => {
    const calls: string[] = [];
    const fakeFetch = vi.fn((input: string, init?: RequestInit) => {
      calls.push(init?.method ?? 'GET');
      const status = init?.method === 'HEAD' ? 405 : 200;
      const response = new Response(status === 200 ? 'body' : null, {
        status,
        headers: { 'content-length': 'abc' },
      });
      return Promise.resolve(Object.defineProperty(response, 'url', { value: input }));
    });
    const probe = await probeHeaders(`${mock.root}pluginfile.php/1/a/b/c.pdf`, fakeFetch);
    expect(calls).toEqual(['HEAD', 'GET']);
    expect(probe.ok && probe.value).toMatchObject({ method: 'GET', contentLength: null });
  });
});

describe('hard names end to end: resolve, then build the path', () => {
  it('gives safe, stable paths for every seeded file', async () => {
    const course = {
      fullName: 'Diseño Digital DMD104 G04L (Soyapango)',
      shortName: 'DMD1042026C02G04LCS',
    };
    const section = { name: 'Semana 12', parent: 'Desarrollo', position: 15, numberWidth: 2 };
    const paths: string[] = [];
    for (const [cmid, name, collision] of [
      [3102, 'Guia 1: Repaso Fundamentos de Redes', false],
      [3103, 'Procedimiento - Guía #9', false],
      [3104, 'Procedimiento - Guía #9', true],
      [3106, 'Simulación.pkt', false],
    ] as const) {
      const f = await file(cmid);
      const built = buildPath({
        course,
        section,
        activity: { cmid, name },
        file: { originalName: f.originalName, extension: f.extension },
        collision,
      });
      if (!built.ok) throw new Error(built.error.code);
      paths.push(built.value.relativePath);
    }
    expect(paths).toEqual([
      'UDB/Diseño Digital DMD104 G04L/Desarrollo/Semana 12/Guia 1 - Repaso Fundamentos de Redes.pdf',
      'UDB/Diseño Digital DMD104 G04L/Desarrollo/Semana 12/Procedimiento - Guía #9.pdf',
      'UDB/Diseño Digital DMD104 G04L/Desarrollo/Semana 12/Procedimiento - Guía #9 (3104).pdf',
      'UDB/Diseño Digital DMD104 G04L/Desarrollo/Semana 12/Simulación.pkt',
    ]);
  });
});
