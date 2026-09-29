import { createServer, type Server } from 'node:https';
import { pathToFileURL } from 'node:url';
import { ensureCert } from './cert';
import { pageRoutes } from './routes/pages';
import type { MockState, Route } from './routes/types';

export const MOCK_PORT = 8443;
/** Chromium maps the real host here with --host-resolver-rules (ADR-002). */
export const MOCK_HOST = 'www.udbvirtual.edu.sv';

const routes: readonly Route[] = [...pageRoutes];

export interface MockMoodle {
  readonly server: Server;
  readonly state: MockState;
  close(): Promise<void>;
}

export async function startMockMoodle(port = MOCK_PORT): Promise<MockMoodle> {
  const state: MockState = { loggedIn: true, requests: [] };
  const server = createServer(ensureCert(), (req, res) => {
    const url = new URL(req.url ?? '/', `https://${MOCK_HOST}`);
    state.requests.push(`${req.method ?? '?'} ${url.pathname}${url.search}`);
    const route = routes.find((r) => r.method === req.method && r.path.test(url.pathname));
    if (route === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    route.handle(req, res, url, state);
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    server,
    state,
    close: () =>
      new Promise<void>((resolve, reject) => {
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
  console.log(`mock moodle on https://127.0.0.1:${MOCK_PORT}`);
  const stop = () => void mock.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
