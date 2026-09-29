import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parseActivities, parseActivity } from '../../../src/moodle/activities';
import { absoluteUrl, cleanText, intParam } from '../../../src/moodle/dom';
import { classifyModule, extractModname } from '../../../src/moodle/modules/classify';

const BASE = 'https://www.udbvirtual.edu.sv/auladigital/course/view.php?id=1';
const el = (html: string) => {
  const doc = new JSDOM(`<ul>${html}</ul>`, { url: BASE }).window.document;
  const first = doc.querySelector('ul > *');
  if (first === null) throw new Error('no element');
  return first;
};

describe('classify', () => {
  it('prefers modtype_* over the URL and never looks at icons', () => {
    expect(extractModname('activity modtype_folder', '/mod/resource/view.php?id=1')).toBe('folder');
    expect(extractModname('activity', 'https://x/mod/resource/view.php?id=1')).toBe('resource');
    expect(extractModname('activity', null)).toBeNull();
  });

  it('maps module names to kinds and download candidates', () => {
    expect(classifyModule('resource')).toEqual({ kind: 'file', downloadCandidate: true });
    expect(classifyModule('folder')).toEqual({ kind: 'folder', downloadCandidate: true });
    expect(classifyModule('assign')).toEqual({ kind: 'assign', downloadCandidate: false });
    expect(classifyModule('hvp')).toEqual({ kind: 'other', downloadCandidate: false });
  });
});

describe('parseActivity', () => {
  it('uses data-id and link text when the usual markup is missing', () => {
    const a = parseActivity(
      el(
        '<li data-for="cmitem" data-id="77" class="activity"><a href="/auladigital/mod/page/view.php?id=77">  Lectura   1 <span class="sr-only">Página</span></a></li>',
      ),
      BASE,
    );
    expect(a).toMatchObject({ cmid: 77, modname: 'page', kind: 'page', name: 'Lectura 1' });
  });

  it('takes the cmid from the link when the id is missing', () => {
    const a = parseActivity(
      el(
        '<li class="activity modtype_url"><a href="/auladigital/mod/url/view.php?id=9">Web</a></li>',
      ),
      BASE,
    );
    expect(a?.cmid).toBe(9);
  });

  it('skips items without a module id or type', () => {
    expect(parseActivity(el('<li class="activity">sin enlace</li>'), BASE)).toBeNull();
  });

  it('truncates long label text', () => {
    const long = 'x'.repeat(300);
    const a = parseActivity(
      el(
        `<li id="module-5" class="activity modtype_label"><div class="contentwithoutlink">${long}</div></li>`,
      ),
      BASE,
    );
    expect(a?.name).toHaveLength(120);
    expect(a?.name.endsWith('…')).toBe(true);
  });

  it('dedupes repeated modules', () => {
    const doc = new JSDOM(
      '<ul><li id="module-1" class="activity modtype_resource"><a href="/auladigital/mod/resource/view.php?id=1"><span class="instancename">A</span></a></li><li id="module-1" class="activity modtype_resource"><a href="/auladigital/mod/resource/view.php?id=1">A</a></li></ul>',
      { url: BASE },
    ).window.document;
    expect(parseActivities(doc, BASE)).toHaveLength(1);
  });
});

describe('dom helpers', () => {
  it('cleans text: whitespace, stars, NFC', () => {
    expect(cleanText('  Semana 12 ★ ')).toBe('Semana 12');
    expect(cleanText('Guía')).toBe('Guía');
  });

  it('resolves only http(s) links', () => {
    expect(absoluteUrl('/a', BASE)).toBe('https://www.udbvirtual.edu.sv/a');
    expect(absoluteUrl('#x', BASE)).toBeNull();
    expect(absoluteUrl('javascript:alert(1)', BASE)).toBeNull();
    expect(absoluteUrl(null, BASE)).toBeNull();
    expect(absoluteUrl('http://[', BASE)).toBeNull();
  });

  it('reads integer params only', () => {
    expect(intParam(`${BASE}&section=3`, 'section')).toBe(3);
    expect(intParam(`${BASE}&section=x`, 'section')).toBeNull();
    expect(intParam('nope', 'id')).toBeNull();
  });
});
