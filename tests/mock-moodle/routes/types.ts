import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SeedFolder, SeedResource } from '../seeds/files';

export interface MockState {
  loggedIn: boolean;
  /** Every request as "METHOD /path?query", for request counts and limits. */
  readonly requests: string[];
  readonly resources: Map<number, SeedResource>;
  readonly folders: Map<number, SeedFolder>;
  /** Changes to a course page since the seeds: added activities, restricted sections opened. */
  readonly pageEdits: Map<number, PageEdits>;
  /** Requests being served now, and the most at once since the last reset (spec §2: 2). */
  inFlight: number;
  maxInFlight: number;
}

export interface PageEdits {
  readonly activities: { readonly section: number; readonly cmid: number; readonly name: string }[];
  readonly revealed: number[];
}

export interface Route {
  readonly method: 'GET' | 'HEAD' | 'POST' | 'ANY';
  readonly path: RegExp;
  /** Pages that stay reachable without a session (login, health). */
  readonly public?: boolean;
  handle(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    state: MockState,
    match: RegExpExecArray,
  ): void;
}

export const BASE = '/auladigital';
export const LOGIN = `${BASE}/login/index.php`;

export function sendHtml(res: ServerResponse, html: string, status = 200): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

export function redirect(res: ServerResponse, location: string, status = 303): void {
  res.writeHead(status, { location });
  res.end();
}

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const page = (title: string, bodyId: string, body: string): string => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body id="${bodyId}"><div role="main">${body}</div></body></html>`;
