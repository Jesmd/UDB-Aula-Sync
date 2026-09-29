import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COURSES } from '../seeds/courses';
import { BASE, escapeHtml, page, sendHtml, type PageEdits, type Route } from './types';

const FIXTURES = 'tests/fixtures/moodle';
const ROOT = 'https://www.udbvirtual.edu.sv/auladigital';

/** Applies test edits to a fixture page: new resources and opened sections. */
export function applyEdits(html: string, edits: PageEdits | undefined): string {
  if (edits === undefined) return html;
  let out = html;
  for (const section of edits.revealed) {
    const start = out.indexOf(`<li id="section-${section}"`);
    if (start < 0) continue;
    const end = out.indexOf('</li>', out.indexOf('<ul class="section img-text">', start));
    const block = out
      .slice(start, end)
      .replace(/<div class="section_availability">[\s\S]*?<\/div><\/div>/, '');
    out = out.slice(0, start) + block + out.slice(end);
  }
  for (const a of edits.activities) {
    const start = out.indexOf(`<li id="section-${a.section}"`);
    if (start < 0) continue;
    const marker = '<ul class="section img-text">';
    const at = out.indexOf(marker, start) + marker.length;
    const li =
      `<li class="activity resource modtype_resource " id="module-${a.cmid}"><div><div class="activityinstance">` +
      `<a class="aalink" href="${ROOT}/mod/resource/view.php?id=${a.cmid}"><span class="instancename">${escapeHtml(a.name)}` +
      `<span class="accesshide "> Archivo</span></span></a></div></div></li>`;
    out = out.slice(0, at) + li + out.slice(at);
  }
  return out;
}

export const pageRoutes: readonly Route[] = [
  {
    method: 'GET',
    path: /^\/__health$/,
    public: true,
    handle: (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    },
  },
  {
    method: 'GET',
    path: /^\/auladigital\/login\/index\.php$/,
    public: true,
    handle: (_req, res) => {
      sendHtml(res, readFileSync(join(FIXTURES, 'auth/login-page.html'), 'utf8'));
    },
  },
  {
    method: 'GET',
    path: /^\/auladigital\/my\/$/,
    handle: (_req, res) => {
      const items = COURSES.map(
        (c) =>
          `<li><a href="${BASE}/course/view.php?id=${c.id}">${escapeHtml(c.fullName)}</a></li>`,
      ).join('');
      sendHtml(res, page('Mis asignaturas', 'page-my-index', `<ul id="courses">${items}</ul>`));
    },
  },
  {
    method: 'GET',
    path: /^\/auladigital\/course\/view\.php$/,
    handle: (_req, res, url, state) => {
      const course = COURSES.find((c) => String(c.id) === url.searchParams.get('id'));
      if (course === undefined) {
        sendHtml(res, page('Error', 'page-course-view', '<p>Curso no encontrado</p>'), 404);
        return;
      }
      // Onetopic fixtures render one tab; any ?section= gets the same page for now (M5 adds per-tab pages).
      const html = readFileSync(join(FIXTURES, course.fixture), 'utf8');
      sendHtml(res, applyEdits(html, state.pageEdits.get(course.id)));
    },
  },
];
