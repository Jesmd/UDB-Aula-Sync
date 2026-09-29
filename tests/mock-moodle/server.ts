import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { ensureCert } from './cert';
import { fileRoutes } from './routes/files';
import { pageRoutes } from './routes/pages';
import { LOGIN, redirect, type MockState, type Route } from './routes/types';
import { FOLDERS, RESOURCES } from './seeds/files';

export const MOCK_PORT = 8443;
/** Chromium maps the real host here with --host-resolver-rules (ADR-002). */
export const MOCK_HOST = 'www.udbvirtual.edu.sv';

const routes: readonly Route[] = [...pageRoutes, ...fileRoutes];

export interface MockMoodle {
  readonly server: Server;
  readonly state: MockState;
  /** Moodle wwwroot of this server, e.g. http://127.0.0.1:1234/auladigital/ */
  readonly root: string;
  close(): Promise<void>;
}

export interface MockOptions {
  /** 0 picks a free port. */
  readonly port?: number;
  /** HTTPS for the browser (E2E); plain HTTP for Node integration tests. */
  readonly tls?: boolean;
}

function freshState(): MockState {
  return {
    loggedIn: true,
    requests: [],
    // structuredClone: tests may mutate their own copy without leaking into others.
    resources: new Map(RESOURCES.map((r) => [r.cmid, structuredClone(r)])),
    folders: new Map(FOLDERS.map((f) => [f.cmid, structuredClone(f)])),
    pageEdits: new Map(),
    inFlight: 0,
    maxInFlight: 0,
  };
}

/** Puts the state back to the seeds, in place (routes keep their reference). */
export function resetState(state: MockState): void {
  const fresh = freshState();
  state.loggedIn = true;
  state.requests.length = 0;
  state.resources.clear();
  for (const [k, v] of fresh.resources) state.resources.set(k, v);
  state.folders.clear();
  for (const [k, v] of fresh.folders) state.folders.set(k, v);
  state.pageEdits.clear();
  state.maxInFlight = state.inFlight;
}

function editsFor(state: MockState, courseId: number) {
  let edits = state.pageEdits.get(courseId);
  if (edits === undefined) {
    edits = { activities: [], revealed: [] };
    state.pageEdits.set(courseId, edits);
  }
  return edits;
}

function handler(state: MockState) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `https://${MOCK_HOST}`);
    // Test control (E2E runs the mock in another process): never counted as site traffic.
    if (url.pathname.startsWith('/__test/')) {
      handleControl(state, url, res);
      return;
    }
    state.requests.push(`${req.method ?? '?'} ${url.pathname}${url.search}`);
    // Page assets (theme images, icons) come from the browser itself, not the extension.
    if (!/\/(theme\/image\.php|pluginfile\.php\/\d+\/user\/)|favicon/.test(url.pathname)) {
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      res.once('close', () => {
        state.inFlight -= 1;
      });
    }
    for (const route of routes) {
      if (route.method !== 'ANY' && route.method !== req.method) continue;
      const match = route.path.exec(url.pathname);
      if (match === null) continue;
      // An expired session sends every private page to the login form, like Moodle.
      if (!state.loggedIn && route.public !== true) {
        redirect(res, LOGIN);
        return;
      }
      route.handle(req, res, url, state, match);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  };
}

const int = (value: string | null) =>
  value !== null && /^\d+$/.test(value) ? Number(value) : undefined;

/**
 * /__test/state, /__test/reset, /__test/session?loggedIn=0|1,
 * /__test/resource?cmid=&revision=&size=&lastModified=&throttleMs=&mode=,
 * /__test/activity?course=&section=&cmid=&name= (a new PDF resource on the course page),
 * /__test/reveal?course=&section= (a restricted section opens)
 */
function handleControl(state: MockState, url: URL, res: ServerResponse): void {
  const json = (body: unknown) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  switch (url.pathname) {
    case '/__test/state':
      json({ loggedIn: state.loggedIn, requests: state.requests, maxInFlight: state.maxInFlight });
      return;
    case '/__test/reset':
      resetState(state);
      json({ ok: true });
      return;
    case '/__test/session':
      state.loggedIn = url.searchParams.get('loggedIn') !== '0';
      json({ ok: true });
      return;
    case '/__test/resource': {
      const seed = state.resources.get(int(url.searchParams.get('cmid')) ?? -1);
      if (seed === undefined) break;
      const revision = int(url.searchParams.get('revision'));
      const size = int(url.searchParams.get('size'));
      const throttleMs = int(url.searchParams.get('throttleMs'));
      const lastModified = url.searchParams.get('lastModified');
      if (revision !== undefined) seed.revision = revision;
      if (size !== undefined) seed.size = size;
      if (throttleMs !== undefined) seed.throttleMs = throttleMs;
      if (lastModified !== null) seed.lastModified = lastModified;
      const mode = url.searchParams.get('mode');
      if (mode === 'redirect' || mode === 'embed' || mode === 'workaround' || mode === 'readonly')
        seed.mode = mode;
      json(seed);
      return;
    }
    case '/__test/activity': {
      const course = int(url.searchParams.get('course'));
      const section = int(url.searchParams.get('section'));
      const cmid = int(url.searchParams.get('cmid'));
      const name = url.searchParams.get('name') ?? 'Nuevo';
      if (course === undefined || section === undefined || cmid === undefined) break;
      editsFor(state, course).activities.push({ section, cmid, name });
      state.resources.set(cmid, {
        cmid,
        mode: 'redirect',
        contextId: 20_000 + cmid,
        revision: 1,
        fileName: `${name}.pdf`,
        contentType: 'application/pdf',
        size: 7_000,
        lastModified: 'Tue, 22 Sep 2026 10:00:00 GMT',
        disposition: 'utf8-raw',
        head: true,
      });
      json({ ok: true });
      return;
    }
    case '/__test/reveal': {
      const course = int(url.searchParams.get('course'));
      const section = int(url.searchParams.get('section'));
      if (course === undefined || section === undefined) break;
      editsFor(state, course).revealed.push(section);
      json({ ok: true });
      return;
    }
    default:
      break;
  }
  res.writeHead(404).end();
}

export async function startMockMoodle(options: MockOptions = {}): Promise<MockMoodle> {
  const state = freshState();
  const tls = options.tls ?? true;
  const server = tls
    ? createHttpsServer(ensureCert(), handler(state))
    : createHttpServer(handler(state));
  await new Promise<void>((resolve) =>
    server.listen(options.port ?? MOCK_PORT, '127.0.0.1', resolve),
  );
  const { port } = server.address() as AddressInfo;
  return {
    server,
    state,
    root: `${tls ? 'https' : 'http'}://127.0.0.1:${port}/auladigital/`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

// CLI: `tsx tests/mock-moodle/server.ts` (used by Playwright's webServer).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const mock = await startMockMoodle();
  console.log(`mock moodle on ${mock.root}`);
  const stop = () => void mock.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
