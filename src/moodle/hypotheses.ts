import { RATE_LIMIT } from '../shared/constants';
import { parseCoursePage } from './course';
import type { HtmlParser } from './html-parser';
import { folderViewUrl, parseFolderPage } from './modules/folder';
import { moodleRoot } from './adapters/sections';
import { probeHeaders, type FetchLike } from './resolver/head-probe';
import { resolveResource } from './resolver/resolve-chain';
import { sanitizeUrl } from './sanitize';

export type HypothesisId = 'H1' | 'H2' | 'H4' | 'H5' | 'H6';
export type HypothesisStatus = 'confirmada' | 'refutada' | 'sin_datos';

export interface HypothesisResult {
  readonly id: HypothesisId;
  readonly status: HypothesisStatus;
  readonly evidence: string;
}

export interface HypothesisReport {
  readonly kind: 'udbsync-hypotheses';
  readonly generatedAt: string;
  readonly page: string;
  /** Requests sent to the site; the spec allows only a few, with consent. */
  readonly requests: number;
  readonly results: readonly HypothesisResult[];
}

export interface HypothesisDeps {
  readonly fetch: FetchLike;
  readonly parseHtml: HtmlParser;
  readonly wait: (ms: number) => Promise<void>;
  readonly now?: () => Date;
}

const r = (id: HypothesisId, status: HypothesisStatus, evidence: string): HypothesisResult => ({
  id,
  status,
  evidence,
});

/**
 * Checks H1, H2, H4, H5 and H6 from the current course page with at most 4 requests,
 * spaced by the rate limit. H3 (worker/offscreen cookies) lives in Options > Diagnóstico.
 */
export async function testHypotheses(
  doc: Document,
  url: string,
  deps: HypothesisDeps,
): Promise<HypothesisReport> {
  let requests = 0;
  const counted: FetchLike = (input, init) => {
    requests += 1;
    return deps.fetch(input, init);
  };
  const pause = () => deps.wait(RATE_LIMIT.maxDelayMs);
  const results: HypothesisResult[] = [];
  const page = parseCoursePage(doc, url);

  // H5 needs no request: the tabs of this page.
  if (!page.ok) {
    results.push(r('H5', 'sin_datos', `página no analizable: ${page.error.code}`));
  } else if (page.value.layout !== 'onetopic') {
    results.push(r('H5', 'sin_datos', `formato ${page.value.layout}, no Onetopic`));
  } else {
    const withUrl = page.value.sections.filter((s) => s.url !== null);
    const pattern = withUrl.every((s) =>
      /\/course\/view\.php\?id=\d+&section=\d+$/.test(s.url ?? ''),
    );
    const dimmed = page.value.sections.filter((s) => !s.available).length;
    results.push(
      r(
        'H5',
        withUrl.length > 0 && pattern ? 'confirmada' : 'refutada',
        `${withUrl.length} pestañas con URL course/view.php?id=&section=; ${dimmed} atenuadas`,
      ),
    );
  }

  const activities = page.ok ? page.value.activities.flatMap((a) => a.items) : [];
  const resource = activities.find((a) => a.modname === 'resource' && a.available);
  const folder = activities.find((a) => a.modname === 'folder' && a.available);
  const root = moodleRoot(url);

  if (resource === undefined) {
    for (const id of ['H1', 'H2', 'H4'] as const)
      results.push(r(id, 'sin_datos', 'no hay recursos en esta página'));
  } else {
    const resolved = await resolveResource(resource.cmid, {
      fetch: counted,
      parseHtml: deps.parseHtml,
      moodleRoot: root,
    });
    if (!resolved.ok) {
      for (const id of ['H1', 'H2', 'H4'] as const)
        results.push(r(id, 'sin_datos', `error: ${resolved.error.code}`));
    } else if (resolved.value.kind === 'readonly') {
      results.push(r('H1', 'refutada', `cmid ${resource.cmid}: solo lectura, sin URL de archivo`));
      results.push(r('H2', 'sin_datos', 'sin URL de archivo'));
      results.push(r('H4', 'sin_datos', 'sin URL de archivo'));
    } else {
      const file = resolved.value.file;
      results.push(
        r(
          'H1',
          file.via === 'redirect' ? 'confirmada' : 'refutada',
          `cmid ${resource.cmid}: ${file.via}`,
        ),
      );
      results.push(
        r(
          'H2',
          file.ref.revision === null ? 'refutada' : 'confirmada',
          `${sanitizeUrl(file.url, url)} (revisión ${file.ref.revision ?? 'ninguna'})`,
        ),
      );
      await pause();
      const probe = await probeHeaders(file.url, counted);
      results.push(
        probe.ok
          ? r(
              'H4',
              probe.value.method === 'HEAD' ? 'confirmada' : 'refutada',
              `${probe.value.method} ${probe.value.status}; tamaño ${probe.value.contentLength ?? '?'}; tipo ${probe.value.contentType ?? '?'}; nombre ${probe.value.disposition?.filename ?? '?'}`,
            )
          : r('H4', 'sin_datos', `error: ${probe.error.code}`),
      );
    }
  }

  if (folder === undefined) {
    results.push(r('H6', 'sin_datos', 'no hay carpetas en esta página'));
  } else {
    await pause();
    try {
      const response = await counted(folderViewUrl(root, folder.cmid), {
        credentials: 'include',
        cache: 'no-store',
      });
      const files = parseFolderPage(deps.parseHtml(await response.text()), response.url);
      const revisions = new Set(files.map((f) => f.ref.revision));
      results.push(
        r(
          'H6',
          files.length > 0 ? 'confirmada' : 'refutada',
          `cmid ${folder.cmid}: ${files.length} archivos, ${files.filter((f) => f.folderPath.length > 0).length} en subcarpetas, revisiones ${[...revisions].join(',')}`,
        ),
      );
    } catch (cause) {
      results.push(
        r('H6', 'sin_datos', `error: ${cause instanceof Error ? cause.message : String(cause)}`),
      );
    }
  }

  const order: readonly HypothesisId[] = ['H1', 'H2', 'H4', 'H5', 'H6'];
  return {
    kind: 'udbsync-hypotheses',
    generatedAt: (deps.now?.() ?? new Date()).toISOString(),
    page: sanitizeUrl(url, url),
    requests,
    results: [...results].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
  };
}
