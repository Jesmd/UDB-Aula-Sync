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
  };
}

function handler(state: MockState) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `https://${MOCK_HOST}`);
    state.requests.push(`${req.method ?? '?'} ${url.pathname}${url.search}`);
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
