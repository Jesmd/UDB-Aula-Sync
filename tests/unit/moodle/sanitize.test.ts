import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parseCourse } from '../../../src/moodle/course';
import { buildDiagnosticReport } from '../../../src/moodle/diagnostic';
import { sanitizeDocument, sanitizeUrl } from '../../../src/moodle/sanitize';
import { courseUrl, loadFixture } from '../../helpers/fixtures';

const URL_101 = courseUrl(101, 14);
const PERSONAL = [
  'Ana Pérez',
  'ana.perez',
  'AbCdEf1234',
  '4242',
  'Mensaje de Juan',
  'Resolver los ejercicios',
];

describe('sanitizeUrl', () => {
  const base = 'https://www.udbvirtual.edu.sv/auladigital/course/view.php?id=1';
  it('keeps structure and numeric ids, drops secrets and free values', () => {
    expect(sanitizeUrl('/auladigital/mod/resource/view.php?id=5&redirect=1', base)).toBe(
      'https://www.udbvirtual.edu.sv/auladigital/mod/resource/view.php?id=5&redirect=1',
    );
    expect(sanitizeUrl('/auladigital/login/logout.php?sesskey=abc', base)).toBe(
      'https://www.udbvirtual.edu.sv/auladigital/login/logout.php',
    );
    expect(sanitizeUrl('/auladigital/search.php?q=mi%20nombre', base)).toBe(
      'https://www.udbvirtual.edu.sv/auladigital/search.php?q=x',
    );
    expect(sanitizeUrl('/auladigital/user/profile.php?id=4242', base)).toBe(
      'https://www.udbvirtual.edu.sv/[personal]',
    );
    expect(sanitizeUrl('https://evil.test/a?b=c', base)).toBe('https://evil.test/[external]');
    expect(sanitizeUrl('javascript:alert(1)', base)).toBe('[url]');
    expect(sanitizeUrl('data:image/png;base64,AAAA', base)).toBe('data:[removed]');
    expect(sanitizeUrl('#section-3', base)).toBe('#section-3');
    expect(sanitizeUrl('#yui_3_17', base)).toBe('#');
    expect(sanitizeUrl('/x#frag', base)).toBe('https://www.udbvirtual.edu.sv/x');
    expect(sanitizeUrl('http://[', base)).toBe('[url]');
  });

  it('keeps pluginfile paths (needed for H2)', () => {
    const p = '/auladigital/pluginfile.php/123/mod_resource/content/4/Guia%201.pdf?forcedownload=1';
    expect(sanitizeUrl(p, base)).toBe(`https://www.udbvirtual.edu.sv${p}`);
  });
});

describe('sanitizeDocument', () => {
  const doc = loadFixture('layouts/onetopic-2level.html', URL_101);
  const { html, removedPersonal } = sanitizeDocument(doc, URL_101);

  it('removes personal data, scripts and secrets', () => {
    for (const text of PERSONAL) expect(html).not.toContain(text);
    expect(html).not.toMatch(/<script|M\.cfg|onclick=/);
    expect(removedPersonal).toBeGreaterThan(0);
  });

  it('keeps structure and names, so the result still parses the same', () => {
    expect(html).toContain('Guía de ejercicios - Teorema del límite central');
    expect(html).toContain('modtype_resource');
    const again = new JSDOM(html, { url: URL_101 }).window.document;
    const before = parseCourse(doc, URL_101);
    const after = parseCourse(again, URL_101);
    expect(after).toEqual(before);
  });

  it('does not mutate the live document', () => {
    expect(doc.querySelector('script')).not.toBeNull();
    expect(doc.body.textContent).toContain('Ana Pérez');
  });

  it('redacts emails in kept text and strips form values and unsafe attributes', () => {
    const d = new JSDOM(
      '<body><h2 onclick="x()" style="color:red" data-x="a b c">Contacto: prof@udb.edu.sv</h2><form><input name="q" value="secreto"></form><p>texto libre</p><div id="yui_3_1" class="a b@c"></div></body>',
      { url: URL_101 },
    ).window.document;
    const out = sanitizeDocument(d, URL_101).html;
    expect(out).toContain('Contacto: [email]');
    expect(out).not.toMatch(/onclick|style=|secreto|texto libre|yui_3_1|b@c/);
    expect(out).toContain('data-x="x"');
    expect(out).toContain('[texto]');
  });
});

describe('buildDiagnosticReport', () => {
  it('bundles detection, parsed course and sanitized html', () => {
    const doc = loadFixture('layouts/onetopic-dimmed-tabs.html', courseUrl(102, 15));
    const report = buildDiagnosticReport(doc, courseUrl(102, 15), '0.1.0', new Date(0));
    expect(report).toMatchObject({
      kind: 'udbsync-diagnostic',
      version: 1,
      generatedAt: '1970-01-01T00:00:00.000Z',
      extensionVersion: '0.1.0',
      page: 'https://www.udbvirtual.edu.sv/auladigital/course/view.php?id=102&section=15',
      detection: { kind: 'onetopic' },
    });
    expect('course' in report.parsed && report.parsed.course.id).toBe(102);
    for (const text of PERSONAL) expect(JSON.stringify(report)).not.toContain(text);
  });

  it('reports parse errors instead of throwing', () => {
    const url = 'https://www.udbvirtual.edu.sv/auladigital/login/index.php';
    const report = buildDiagnosticReport(loadFixture('auth/login-page.html', url), url, '0.1.0');
    expect(report.parsed).toEqual({ error: { code: 'session_expired' } });
    expect(report.html).not.toContain('Tk9876543210');
  });
});

describe('scripts/sanitize-fixture.ts', () => {
  const run = (...args: string[]) =>
    execFileSync('pnpm', ['exec', 'tsx', 'scripts/sanitize-fixture.ts', ...args], {
      encoding: 'utf8',
      stdio: 'pipe',
    });

  it('sanitizes a saved page and a diagnostic report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'udbsync-fixture-'));
    const out1 = join(dir, 'page.html');
    run('tests/fixtures/moodle/layouts/topics.html', out1, '--url', courseUrl(103));
    const page = readFileSync(out1, 'utf8');
    expect(page).toContain('Source URL: /auladigital/course/view.php?id=103');
    for (const text of PERSONAL) expect(page).not.toContain(text);

    const report = buildDiagnosticReport(
      loadFixture('layouts/topics.html', courseUrl(103)),
      courseUrl(103),
      '0.1.0',
    );
    const json = join(dir, 'diag.json');
    writeFileSync(json, JSON.stringify(report));
    const out2 = join(dir, 'from-report.html');
    run(json, out2);
    expect(readFileSync(out2, 'utf8')).toContain('Topología_Jerárquica_Guía2');
  });
});
