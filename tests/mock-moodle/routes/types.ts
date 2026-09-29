import type { IncomingMessage, ServerResponse } from 'node:http';

export interface MockState {
  loggedIn: boolean;
  /** Every request path, for asserting request counts and "no requests while logged out". */
  readonly requests: string[];
}

export interface Route {
  readonly method: 'GET' | 'HEAD' | 'POST';
  readonly path: RegExp;
  handle(req: IncomingMessage, res: ServerResponse, url: URL, state: MockState): void;
}

export function sendHtml(res: ServerResponse, html: string, status = 200): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

export function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { location });
  res.end();
}
