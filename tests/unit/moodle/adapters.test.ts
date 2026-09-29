import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parseCourse, parseCoursePage, parseSection } from '../../../src/moodle/course';
import { detectLayout } from '../../../src/moodle/detect-layout';
import { courseUrl, loadFixture, readFixture } from '../../helpers/fixtures';

const page = (fixture: string, url: string) => {
  const result = parseCoursePage(loadFixture(fixture, url), url);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};

describe('onetopic, level-2 row after level-1 row', () => {
  const url = courseUrl(101, 14);
  const p = page('layouts/onetopic-2level.html', url);

  it('orders sections: rendered extras, level-1 tabs, then their children', () => {
    expect(p.sections.slice(0, 4).map((s) => [s.number, s.name, s.parent])).toEqual([
      [0, 'General', null],
      [1, 'Planificación', null],
      [2, 'Desarrollo', null],
      [3, 'Semana 1', 'Desarrollo'],
    ]);
    // The "Desarrollo" subtab duplicates its parent and is dropped.
    expect(p.sections.filter((s) => s.number === 2)).toHaveLength(1);
    expect(p.sections.at(-1)).toMatchObject({
      number: 20,
      name: 'Semana 18',
      parent: 'Desarrollo',
    });
  });

  it('parses the rendered week', () => {
    const week = p.activities.find((a) => a.section.number === 14)?.items ?? [];
    expect(week.map((a) => [a.cmid, a.kind, a.name])).toEqual([
      [2101, 'label', 'SEMANA 12: 14 al 19 de septiembre'],
      [2102, 'file', 'Presentación Semana 12'],
      [2103, 'file', 'Guía de ejercicios - Teorema del límite central'],
      [2104, 'file', 'Tabla t-student'],
      [2105, 'assign', 'Tarea 12: Intervalos de confianza'],
      [2106, 'folder', 'Material complementario'],
      [2107, 'url', 'Calculadora de distribuciones'],
    ]);
    expect(week[1]?.detailsHint).toBe('1.2MB Documento PDF');
    // Availability notice shown, but the link works.
    expect(week[3]).toMatchObject({ available: true, restricted: true });
  });

  it('parseSection returns the same activities', () => {
    const doc = loadFixture('layouts/onetopic-2level.html', url);
    const result = parseSection(doc, url, 0);
    expect(result.ok && result.value.map((a) => a.name)).toEqual(['Avisos']);
  });
});

describe('onetopic, level-2 row nested in its parent tab', () => {
  const p = page('layouts/onetopic-dimmed-tabs.html', courseUrl(102, 15));

  it('attaches nested children and keeps later level-1 tabs', () => {
    expect(p.sections.map((s) => s.name).slice(0, 3)).toEqual([
      'Organización',
      'Desarrollo',
      'Semana 1',
    ]);
    expect(p.sections.at(-1)).toMatchObject({
      number: 3,
      name: 'Recursos Bibliográficos',
      parent: null,
    });
    expect(p.sections.some((s) => s.name === 'Otro curso')).toBe(false);
  });

  it('treats dimmed tabs as unavailable, with no fetch URL', () => {
    const s13 = p.sections.find((s) => s.name === 'Semana 13');
    expect(s13).toMatchObject({ number: 16, available: false, url: null });
    // A tab without a link has no known number.
    expect(p.sections.find((s) => s.name === 'Semana 19')).toMatchObject({
      number: null,
      available: false,
    });
  });

  it('flags the highlighted tab from its <li> class', () => {
    expect(p.sections.find((s) => s.name === 'Semana 12')).toMatchObject({
      highlighted: true,
      rendered: true,
    });
  });

  it('keeps duplicate names apart by cmid and marks locked activities', () => {
    const items = p.activities.flatMap((a) => a.items);
    expect(items.filter((a) => a.name === 'Procedimiento - Guía #9').map((a) => a.cmid)).toEqual([
      3103, 3104,
    ]);
    expect(items.find((a) => a.cmid === 3105)).toMatchObject({
      name: 'Práctica final (bloqueada)',
      available: false,
      restricted: true,
      url: null,
    });
  });
});

describe('topics', () => {
  const p = page('layouts/topics.html', courseUrl(103));

  it('shares one course URL for every section', () => {
    expect(new Set(p.sections.map((s) => s.url))).toEqual(
      new Set(['https://www.udbvirtual.edu.sv/auladigital/course/view.php?id=103']),
    );
  });

  it('keeps names with colons, underscores and accents verbatim', () => {
    const names = p.activities.flatMap((a) => a.items.map((i) => i.name));
    expect(names).toContain('Guia 1: Repaso Fundamentos de Redes');
    expect(names).toContain('Topología_Jerárquica_Guía2');
    expect(p.activities.find((a) => a.section.number === 0)?.items.map((i) => i.name)).toEqual([
      'Avisos',
      'Planificación',
    ]);
  });
});

describe('detectLayout heuristics without a format class', () => {
  const strip = (fixture: string, url: string) => {
    const doc = loadFixture(fixture, url);
    doc.body.className = doc.body.className.replace(/format-\w+/, '');
    return doc;
  };

  it('uses section tabs, then section elements, then generic', () => {
    expect(detectLayout(strip('layouts/onetopic-2level.html', courseUrl(101))).kind).toBe(
      'onetopic',
    );
    expect(detectLayout(strip('layouts/topics.html', courseUrl(103))).kind).toBe('topics');
    const empty = new JSDOM('<body><p>hola</p></body>').window.document;
    expect(detectLayout(empty)).toEqual({
      kind: 'generic',
      evidence: ['no format-* body class', 'no sections or tabs'],
    });
  });
});

describe('parseCourse errors and fallbacks', () => {
  it('reports session_expired on the login page', () => {
    const url = 'https://www.udbvirtual.edu.sv/auladigital/login/index.php';
    const result = parseCourse(loadFixture('auth/login-page.html', url), url);
    expect(!result.ok && result.error.code).toBe('session_expired');
  });

  it('reports not_course_page without a course id', () => {
    const doc = new JSDOM('<body class="format-site"><h1>Inicio</h1></body>').window.document;
    const result = parseCourse(doc, 'https://www.udbvirtual.edu.sv/auladigital/my/');
    expect(!result.ok && result.error.code).toBe('not_course_page');
  });

  it('falls back to the URL id and the document title', () => {
    const html = readFixture('layouts/topics.html')
      .replace(/course-103 /, '')
      .replace(/<div class="page-header-headings">.*?<\/div>/s, '');
    const url = courseUrl(103);
    const doc = new JSDOM(html, { url }).window.document;
    const result = parseCourse(doc, url);
    expect(result.ok && result.value.course).toEqual({
      id: 103,
      fullName: 'Introducción a Redes IRD101 G02T (Soyapango)',
      shortName: 'IRD1012026C02G02TCS',
    });
  });
});
