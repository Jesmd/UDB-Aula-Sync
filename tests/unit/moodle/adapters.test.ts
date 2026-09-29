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

describe('onetopic, real site markup (49946)', () => {
  const url = courseUrl(49946, 2);
  const p = page('real/onetopic-2level-49946.html', url);

  it('lists level-1 tabs without children and the children of the active group', () => {
    expect(p.sections.map((s) => [s.number, s.name, s.parent])).toEqual([
      [0, 'General', null],
      [1, 'Inicio', 'Contenido'],
      [2, 'Semana 7', 'Contenido'],
      [3, 'Semana 8', 'Contenido'],
      [4, 'Semana 9', 'Contenido'],
      [5, 'Semana10', 'Contenido'],
      [6, 'Semana 11', 'Contenido'],
      [7, 'Semana 12', 'Contenido'],
      [8, 'Semana 13', 'Contenido'],
      [9, 'Semana 14', 'Contenido'],
    ]);
  });

  it('gives the active tab (no link) the number of the shown section', () => {
    expect(p.sections.find((s) => s.name === 'Semana 7')).toEqual({
      number: 2,
      name: 'Semana 7',
      parent: 'Contenido',
      url: 'https://www.udbvirtual.edu.sv/auladigital/course/view.php?id=49946&section=2',
      available: true,
      highlighted: false,
      rendered: true,
    });
  });

  it('strips the #tabs-tree-start fragment from tab URLs', () => {
    expect(p.sections.find((s) => s.number === 8)?.url).toBe(
      'https://www.udbvirtual.edu.sv/auladigital/course/view.php?id=49946&section=8',
    );
  });

  it('finds the number without ?section= through the breadcrumb', () => {
    const doc = loadFixture('real/onetopic-2level-49946.html', courseUrl(49946));
    const result = parseCourse(doc, courseUrl(49946));
    expect(result.ok && result.value.sections.find((s) => s.rendered)?.number).toBe(2);
  });

  it('parses the shown week', () => {
    expect(
      p.activities.map((a) => [a.section.number, a.items.map((i) => [i.cmid, i.name])]),
    ).toEqual([
      [
        2,
        [
          [2229872, 'DMD104 Secuencia Didactica Semana 7'],
          [2229873, 'DMD104 S7 reglas-asociacion-kmeansv2'],
        ],
      ],
    ]);
  });
});

describe('onetopic, synthetic two levels', () => {
  const url = courseUrl(101, 14);
  const p = page('layouts/onetopic-2level.html', url);

  it('keeps page order and groups weeks under their level-1 tab', () => {
    expect(p.sections.slice(0, 4).map((s) => [s.number, s.name, s.parent])).toEqual([
      [0, 'General', null],
      [1, 'Planificación', null],
      [2, 'Inicio', 'Desarrollo'],
      [3, 'Semana 1', 'Desarrollo'],
    ]);
    expect(p.sections.some((s) => s.name === 'Desarrollo')).toBe(false);
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

  it('parseSection returns nothing for sections not in this page', () => {
    const doc = loadFixture('layouts/onetopic-2level.html', url);
    const result = parseSection(doc, url, 0);
    expect(result.ok && result.value).toEqual([]);
  });
});

describe('onetopic, dimmed tabs (synthetic, TODO(verify-real-DOM))', () => {
  const p = page('layouts/onetopic-dimmed-tabs.html', courseUrl(102, 15));

  it('keeps later level-1 tabs and drops tabs of other courses', () => {
    expect(p.sections.map((s) => s.name).slice(0, 3)).toEqual([
      'Organización',
      'Inicio',
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
    expect(p.sections.find((s) => s.name === 'Semana 13')).toMatchObject({
      number: 16,
      available: false,
      url: null,
    });
    // An inactive tab without a link has no known number.
    expect(p.sections.find((s) => s.name === 'Semana 19')).toMatchObject({
      number: null,
      available: false,
    });
  });

  it('flags the highlighted tab from its <li> class', () => {
    expect(p.sections.find((s) => s.name === 'Semana 12')).toMatchObject({
      number: 15,
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

describe('onetopic, level-2 row nested in its parent <li>', () => {
  it('attaches nested children to that parent', () => {
    const url = courseUrl(7, 5);
    const R = 'https://www.udbvirtual.edu.sv/auladigital/course/view.php?id=7&amp;section=';
    const html = `<body class="format-onetopic course-7"><div class="course-content">
      <ul class="nav nav-tabs">
        <li><a class="nav-link" href="${R}1">A</a></li>
        <li><a class="nav-link" href="${R}2">B</a>
          <ul class="nav nav-tabs"><li><a class="nav-link" href="${R}4">B1</a></li><li><a class="nav-link active">B2</a></li></ul>
        </li>
        <li><a class="nav-link" href="${R}3">C</a></li>
      </ul>
      <ul class="topics"><li id="section-5" class="section main"><h3 class="sectionname">B2</h3></li></ul>
    </div></body>`;
    const doc = new JSDOM(html, { url }).window.document;
    const result = parseCourse(doc, url);
    expect(
      result.ok && result.value.sections.map((s) => [s.number, s.name, s.parent, s.rendered]),
    ).toEqual([
      [1, 'A', null, false],
      [4, 'B1', 'B', false],
      [5, 'B2', 'B', true],
      [3, 'C', null, false],
    ]);
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
