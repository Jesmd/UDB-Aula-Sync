import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COURSES } from '../seeds/courses';
import { BASE, escapeHtml, page, sendHtml, type Route } from './types';

const FIXTURES = 'tests/fixtures/moodle';

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
    handle: (_req, res, url) => {
      const course = COURSES.find((c) => String(c.id) === url.searchParams.get('id'));
      if (course === undefined) {
        sendHtml(res, page('Error', 'page-course-view', '<p>Curso no encontrado</p>'), 404);
        return;
      }
      // Onetopic fixtures render one tab; any ?section= gets the same page for now (M5 adds per-tab pages).
      sendHtml(res, readFileSync(join(FIXTURES, course.fixture), 'utf8'));
    },
  },
];
