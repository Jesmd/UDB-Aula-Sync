import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  chromium,
  test as base,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import type { Task } from '../../src/core/queue/task';
import type { FileRecord } from '../../src/storage/db';

const DIST = resolve(import.meta.dirname, '../../dist');
const MOCK = 'https://127.0.0.1:8443';

export interface MockControl {
  reset(): Promise<void>;
  requests(): Promise<string[]>;
  setSession(loggedIn: boolean): Promise<void>;
  setResource(cmid: number, changes: Record<string, string | number>): Promise<void>;
}

export interface QueueSnapshot {
  readonly tasks: Task[];
  readonly files: FileRecord[];
  readonly paused: boolean;
}

interface Fixtures {
  downloadsDir: string;
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  mock: MockControl;
  /** An extension page, for chrome.* calls the tests make. */
  extPage: Page;
  queue: () => Promise<QueueSnapshot>;
}

/**
 * Loads the built extension. The real UDB host resolves to the mock server and every
 * other host fails to resolve, so tests never reach the real site (ADR-002).
 */
export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  downloadsDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'udbsync-downloads-'));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
  context: async ({ downloadsDir }, use) => {
    // The browser's own Downloads folder (like the user's), preset in the profile.
    const profile = mkdtempSync(join(tmpdir(), 'udbsync-profile-'));
    mkdirSync(join(profile, 'Default'));
    writeFileSync(
      join(profile, 'Default', 'Preferences'),
      JSON.stringify({
        download: {
          default_directory: downloadsDir,
          prompt_for_download: false,
          directory_upgrade: true,
        },
      }),
    );
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      // chrome.i18n follows the UI language; Spanish is the extension default. A UTF-8
      // locale is required on Linux, or Chromium rejects non-ASCII download names.
      env: { ...process.env, LANGUAGE: 'es', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      ignoreHTTPSErrors: true,
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        '--host-resolver-rules=MAP www.udbvirtual.edu.sv 127.0.0.1:8443, MAP * ~NOTFOUND',
        '--ignore-certificate-errors',
        // Hermetic: ignore any system/CI proxy so the resolver rules apply.
        '--no-proxy-server',
      ],
    });
    // Playwright overrides downloads (GUID names in its own folder); hand them back to
    // Chromium so the extension's relative paths land in the profile's Downloads folder.
    const page = context.pages()[0] ?? (await context.newPage());
    const cdp = await context.newCDPSession(page);
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' });
    await use(context);
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
  // Auto: every test starts from a clean mock, even when it never touches it.
  mock: [
    async ({ context }, use) => {
      const call = async (path: string) => {
        const response = await context.request.get(`${MOCK}${path}`);
        if (!response.ok()) throw new Error(`mock ${path}: ${response.status()}`);
        return (await response.json()) as unknown;
      };
      const control: MockControl = {
        reset: async () => {
          await call('/__test/reset');
        },
        requests: async () => ((await call('/__test/state')) as { requests: string[] }).requests,
        setSession: async (loggedIn) => {
          await call(`/__test/session?loggedIn=${loggedIn ? 1 : 0}`);
        },
        setResource: async (cmid, changes) => {
          const query = new URLSearchParams({
            cmid: String(cmid),
            ...Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, String(v)])),
          });
          await call(`/__test/resource?${query.toString()}`);
        },
      };
      await control.reset();
      await use(control);
    },
    { auto: true },
  ],
  extPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/options/index.html`);
    await use(page);
  },
  queue: async ({ extPage }, use) => {
    await use(async () => {
      const response = await extPage.evaluate(() =>
        chrome.runtime.sendMessage<unknown, { ok: boolean; value: QueueSnapshot }>({
          target: 'background',
          type: 'queue/list',
        }),
      );
      if (!response.ok) throw new Error('queue/list failed');
      return response.value;
    });
  },
});

export const expect = test.expect;

export const UDB = 'https://www.udbvirtual.edu.sv/auladigital';
