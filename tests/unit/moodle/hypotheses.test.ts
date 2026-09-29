import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { testHypotheses, type HypothesisDeps } from '../../../src/moodle/hypotheses';
import { startMockMoodle, type MockMoodle } from '../../mock-moodle/server';
import { courseUrl, loadFixture } from '../../helpers/fixtures';
import { jsdomParser } from '../../helpers/html-parser';

let mock: MockMoodle;
beforeAll(async () => {
  mock = await startMockMoodle({ port: 0, tls: false });
});
afterAll(async () => {
  await mock.close();
});

/** Rewrites the real host to the local mock, as the browser's resolver rules do in E2E. */
function deps(wait = vi.fn(() => Promise.resolve())): HypothesisDeps {
  return {
    fetch: (input, init) =>
      fetch(input.replace('https://www.udbvirtual.edu.sv/auladigital/', mock.root), init),
    parseHtml: jsdomParser,
    wait,
    now: () => new Date(0),
  };
}

describe('testHypotheses', () => {
  it('checks H1, H2, H4-H6 from an Onetopic page with at most 4 requests and pauses', async () => {
    const wait = vi.fn(() => Promise.resolve());
    const url = courseUrl(101, 14);
    const report = await testHypotheses(
      loadFixture('layouts/onetopic-2level.html', url),
      url,
      deps(wait),
    );
    expect(report.requests).toBeLessThanOrEqual(4);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(report.results.map((r) => [r.id, r.status])).toEqual([
      ['H1', 'confirmada'],
      ['H2', 'confirmada'],
      ['H4', 'confirmada'],
      ['H5', 'confirmada'],
      ['H6', 'confirmada'],
    ]);
    expect(report.results.find((r) => r.id === 'H6')?.evidence).toBe(
      'cmid 2106: 3 archivos, 2 en subcarpetas, revisiones 4',
    );
    expect(report).toMatchObject({
      kind: 'udbsync-hypotheses',
      generatedAt: '1970-01-01T00:00:00.000Z',
    });
  });

  it('reports missing data instead of guessing', async () => {
    const url = courseUrl(105);
    const report = await testHypotheses(loadFixture('layouts/generic.html', url), url, deps());
    expect(Object.fromEntries(report.results.map((r) => [r.id, r.status]))).toMatchObject({
      H5: 'sin_datos',
    });
    const login = 'https://www.udbvirtual.edu.sv/auladigital/login/index.php';
    const none = await testHypotheses(loadFixture('auth/login-page.html', login), login, deps());
    expect(none.requests).toBe(0);
    expect(none.results.every((r) => r.status === 'sin_datos')).toBe(true);
  });

  it('refutes H1 for embedded resources and H4 when HEAD is refused', async () => {
    const url = courseUrl(101, 14);
    const doc = loadFixture('layouts/onetopic-2level.html', url);
    // Make the first resource of the page one that is embedded and refuses HEAD.
    doc.getElementById('module-2102')?.remove();
    doc.getElementById('module-2103')?.remove();
    const report = await testHypotheses(doc, url, deps());
    expect(Object.fromEntries(report.results.map((r) => [r.id, r.status]))).toMatchObject({
      H1: 'refutada',
      H4: 'refutada',
    });
  });
});
