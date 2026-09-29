import { resolve } from 'node:path';
import { chromium, test as base, type BrowserContext, type Worker } from '@playwright/test';

const DIST = resolve(import.meta.dirname, '../../dist');

/**
 * Loads the built extension. The real UDB host resolves to the mock server and every
 * other host fails to resolve, so tests never reach the real site (ADR-002).
 */
export const test = base.extend<{ context: BrowserContext; worker: Worker; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      // chrome.i18n follows the UI language; Spanish is the extension default.
      env: { ...process.env, LANGUAGE: 'es' },
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        '--host-resolver-rules=MAP www.udbvirtual.edu.sv 127.0.0.1:8443, MAP * ~NOTFOUND',
        '--ignore-certificate-errors',
        // Hermetic: ignore any system/CI proxy so the resolver rules apply.
        '--no-proxy-server',
      ],
    });
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;

export const UDB = 'https://www.udbvirtual.edu.sv/auladigital';
