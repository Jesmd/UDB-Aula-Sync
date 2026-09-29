import { describe, expect, it } from 'vitest';
import {
  buildPath,
  DEFAULT_PATH_SETTINGS,
  type PathInput,
} from '../../../../src/core/paths/build-path';
import {
  courseDisplayName,
  courseShortLabel,
  cycleLabel,
  parseCourseCode,
} from '../../../../src/core/paths/course-code';
import { fileNameBudget, fitFolders } from '../../../../src/core/paths/path-limits';
import { parseTemplate, renderTemplate } from '../../../../src/core/paths/template';

const input = (over: Partial<PathInput> = {}): PathInput => ({
  course: {
    fullName: 'Estadística Aplicada ESA501 G01T (Soyapango)',
    shortName: 'ESA5012026C02G01TCS',
  },
  section: { name: 'Semana 12', parent: 'Desarrollo', position: 14, numberWidth: 2 },
  activity: { cmid: 2102, name: 'Presentación Semana 12' },
  file: { originalName: 'presentacion_s12.pdf', extension: 'pdf' },
  ...over,
});

const path = (over: Partial<PathInput> = {}, settings = DEFAULT_PATH_SETTINGS) => {
  const result = buildPath(input(over), settings);
  if (!result.ok) throw new Error(result.error.detail ?? result.error.code);
  return result.value.relativePath;
};

describe('course code', () => {
  it('parses the three real codes', () => {
    expect(parseCourseCode('ESA5012026C02G01TCS')).toEqual({
      materia: 'ESA501',
      anio: '2026',
      ciclo: '02',
      grupo: '01',
      modalidad: 'T',
      campus: 'CS',
    });
    expect(parseCourseCode('DMD1042026C02G04LCS')?.modalidad).toBe('L');
    expect(parseCourseCode('IRD1012026C02G02TCS')?.materia).toBe('IRD101');
    expect(parseCourseCode('dmd1042026c02g02tcs')?.grupo).toBe('02');
  });

  it('returns null for anything else and falls back', () => {
    expect(parseCourseCode('Curso libre')).toBeNull();
    expect(parseCourseCode(null)).toBeNull();
    expect(courseShortLabel(null, 'XYZ')).toBe('XYZ');
    expect(courseShortLabel(parseCourseCode('ESA5012026C02G01TCS'), null)).toBe('ESA501 G01T');
    expect(cycleLabel(null)).toBeNull();
    expect(cycleLabel(parseCourseCode('ESA5012026C02G01TCS'))).toBe('2026-C02');
  });

  it('drops the campus from the display name', () => {
    expect(courseDisplayName('Estadística Aplicada ESA501 G01T (Soyapango)')).toBe(
      'Estadística Aplicada ESA501 G01T',
    );
    expect(courseDisplayName('Sin campus')).toBe('Sin campus');
    expect(courseDisplayName('(Soyapango)')).toBe('(Soyapango)');
  });
});

describe('template', () => {
  it('rejects unsafe or unknown templates', () => {
    for (const bad of [
      '',
      '/abs/{archivo}',
      'C:/x/{archivo}',
      '{base}/../{archivo}',
      '{base}//{archivo}',
      '{foo}/{archivo}',
      '{base}/{seccion}',
      '{archivo}/{archivo}',
      '{base}/{x{archivo}',
    ]) {
      expect(parseTemplate(bad).ok, bad).toBe(false);
    }
  });

  it('drops token-only segments with no value but keeps literals', () => {
    const t = parseTemplate('{base}/{padre}/S-{seccion}/lit/{archivo}');
    if (!t.ok) throw new Error();
    expect(renderTemplate(t.value, { base: 'B', padre: null, seccion: '1', archivo: 'f' })).toEqual(
      ['B', 'S-1', 'lit', 'f'],
    );
    expect(renderTemplate(t.value, { base: 'B', padre: 'P', seccion: '', archivo: 'f' })).toEqual([
      'B',
      'P',
      'S-',
      'lit',
      'f',
    ]);
  });
});

describe('buildPath', () => {
  it('builds the spec example (structure A)', () => {
    expect(path()).toBe(
      'UDB/Estadística Aplicada ESA501 G01T/Desarrollo/Semana 12/Presentación Semana 12.pdf',
    );
  });

  it('omits the parent for structure B and pads numbers', () => {
    expect(path({ section: { name: 'Tema 2', parent: null, position: 3, numberWidth: 2 } })).toBe(
      'UDB/Estadística Aplicada ESA501 G01T/Tema 02/Presentación Semana 12.pdf',
    );
  });

  it('applies options: no parent, cycle folder, order prefix, no padding, nested base', () => {
    const settings = {
      ...DEFAULT_PATH_SETTINGS,
      base: 'Uni/UDB',
      includeParent: false,
      groupByCycle: true,
      orderPrefix: true,
      padNumbers: false,
    };
    expect(
      path(
        { section: { name: 'Semana 2', parent: 'Desarrollo', position: 4, numberWidth: 2 } },
        settings,
      ),
    ).toBe(
      'Uni/UDB/2026-C02/Estadística Aplicada ESA501 G01T/04 - Semana 2/Presentación Semana 12.pdf',
    );
  });

  it('names files by activity, original or both', () => {
    expect(path({}, { ...DEFAULT_PATH_SETTINGS, fileNaming: 'original' })).toMatch(
      /\/presentacion_s12\.pdf$/,
    );
    expect(path({}, { ...DEFAULT_PATH_SETTINGS, fileNaming: 'ambos' })).toMatch(
      /\/Presentación Semana 12 - presentacion_s12\.pdf$/,
    );
    expect(
      path(
        { file: { originalName: 'Presentación Semana 12.pdf', extension: 'pdf' } },
        { ...DEFAULT_PATH_SETTINGS, fileNaming: 'ambos' },
      ),
    ).toMatch(/\/Presentación Semana 12\.pdf$/);
  });

  it('uses the real extension, the URL one, or none', () => {
    expect(path({ file: { originalName: 'x', extension: 'pptx' } })).toMatch(/12\.pptx$/);
    expect(path({ file: { originalName: 'lab.pkt', extension: '' } })).toMatch(/12\.pkt$/);
    expect(path({ file: { originalName: 'noext', extension: '' } })).toMatch(/Semana 12$/);
  });

  it('adds the stable cmid suffix on collisions', () => {
    expect(
      path({ activity: { cmid: 3104, name: 'Procedimiento - Guía #9' }, collision: true }),
    ).toMatch(/\/Procedimiento - Guía #9 \(3104\)\.pdf$/);
  });

  it('keeps mod_folder subfolders and file names', () => {
    expect(
      path({
        activity: { cmid: 2106, name: 'Material complementario' },
        file: {
          originalName: 'ejercicio 1.pdf',
          extension: 'pdf',
          folderPath: ['Unidad 1', 'Resueltos'],
        },
      }),
    ).toBe(
      'UDB/Estadística Aplicada ESA501 G01T/Desarrollo/Semana 12/Material complementario/Unidad 1/Resueltos/ejercicio 1.pdf',
    );
  });

  it('sanitizes hostile course data', () => {
    const p = path({
      course: { fullName: '../../Windows/System32', shortName: null },
      section: { name: 'CON', parent: '..', position: 1, numberWidth: 1 },
      activity: { cmid: 1, name: 'a<b>:c' },
    });
    expect(p).toBe('UDB/.. - .. - Windows - System32/_/CON_/ab - c.pdf');
    expect(p.split('/')).not.toContain('..');
  });

  it('stays within 120 per segment and 180 in total, keeping extension and suffix', () => {
    const long = 'Palabra '.repeat(40);
    const result = buildPath(
      input({
        course: { fullName: long, shortName: null },
        section: { name: long, parent: long, position: 1, numberWidth: 1 },
        activity: { cmid: 77, name: long },
        collision: true,
      }),
    );
    if (!result.ok) throw new Error();
    expect(result.value.relativePath.length).toBeLessThanOrEqual(180);
    for (const s of result.value.segments) expect(s.length).toBeLessThanOrEqual(120);
    expect(result.value.relativePath).toMatch(/ \(77\)\.pdf$/);
    expect(result.value.segments[0]).toBe('UDB');
  });

  it('reports invalid templates', () => {
    const result = buildPath(input(), {
      ...DEFAULT_PATH_SETTINGS,
      template: '{base}/{nope}/{archivo}',
    });
    expect(!result.ok && result.error.code).toBe('invalid_template');
  });

  it('flattens {base} mixed with text', () => {
    expect(
      path({}, { ...DEFAULT_PATH_SETTINGS, base: 'A/B', template: '{base}-x/{archivo}' }),
    ).toBe('A - B-x/Presentación Semana 12.pdf');
  });
});

describe('path limits', () => {
  it('refuses unsafe segments and computes budgets', () => {
    expect(fitFolders(['ok', '..'], 'f').ok).toBe(false);
    expect(fitFolders(['a/b'], 'f').ok).toBe(false);
    expect(fitFolders(['ok'], '').ok).toBe(false);
    expect(fileNameBudget(['a'.repeat(50)], { segment: 120, relativePath: 30 })).toBe(21);
  });

  it('stops shrinking at the minimum folder length', () => {
    const result = fitFolders(['a'.repeat(20), 'b'.repeat(20)], 'f'.repeat(40), {
      segment: 120,
      relativePath: 50,
    });
    expect(result.ok && result.value.map((s) => s.length)).toEqual([8, 8]);
  });
});
