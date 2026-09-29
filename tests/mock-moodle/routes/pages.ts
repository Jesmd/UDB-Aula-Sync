import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COURSES } from '../seeds/courses';
import { redirect, sendHtml, type Route } from './types';

const BASE = '/auladigital';
const LOGIN = `${BASE}/login/index.php`;
const FIXTURES = 'tests/fixtures/moodle';

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const page = (title: string, body: string): string => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body id="page-mock">${body}</body></html>`;

/** Page routes. Pluginfile, redirect=1, folders, 429 and session expiry arrive in M2-M5. */
export const pageRoutes: readonly Route[] = [
  {
    method: 'GET',
    path: /^\/__health$/,
    handle: (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    },
  },
  {
    method: 'GET',
    path: /^\/auladigital\/login\/index\.php$/,
    handle: (_req, res) => {
      sendHtml(
        res,
        page('Aula Digital: Entrar al sitio', '<form id="login"><input name="username"></form>'),
      );
    },
  },
  {
    method: 'GET',
    path: /^\/auladigital\/my\/$/,
    handle: (_req, res, _url, state) => {
      if (!state.loggedIn) {
        redirect(res, LOGIN);
        return;
      }
      const items = COURSES.map(
        (c) =>
          `<li><a href="${BASE}/course/view.php?id=${c.id}">${escapeHtml(c.fullName)}</a></li>`,
      ).join('');
      sendHtml(res, page('Mis asignaturas', `<ul id="courses">${items}</ul>`));
    },
  },
  {
    method: 'GET',
    path: /^\/auladigital\/course\/view\.php$/,
    handle: (_req, res, url, state) => {
      if (!state.loggedIn) {
        redirect(res, LOGIN);
        return;
      }
      const course = COURSES.find((c) => String(c.id) === url.searchParams.get('id'));
      if (course === undefined) {
        sendHtml(res, page('Error', '<p>Curso no encontrado</p>'), 404);
        return;
      }
      // Onetopic fixtures render one tab; any ?section= gets the same page for now (M5 adds per-tab pages).
      sendHtml(res, readFileSync(join(FIXTURES, course.fixture), 'utf8'));
    },
  },
];
