import { vi } from 'vitest';

/** Minimal chrome.* stub for unit tests. Extend per test with vi.spyOn or overrides. */
export function installChromeStub(overrides: Record<string, unknown> = {}): void {
  const stub = {
    runtime: {
      id: 'test-extension-id',
      getURL: (path: string) => `chrome-extension://test-extension-id/${path}`,
      getManifest: () => ({ version: '0.0.1' }),
      sendMessage: vi.fn(),
    },
    i18n: { getMessage: vi.fn(() => '') },
    ...overrides,
  };
  vi.stubGlobal('chrome', stub);
}
