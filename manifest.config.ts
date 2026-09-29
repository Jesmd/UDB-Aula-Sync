import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

/** Single source for what the extension may touch. scripts/check-manifest.ts audits the built result. */
export const PERMISSIONS = [
  'downloads',
  'downloads.open',
  'storage',
  'alarms',
  'notifications',
  'offscreen',
  'idle',
] as const;

export const HOST_PERMISSIONS = ['https://www.udbvirtual.edu.sv/auladigital/*'] as const;

export default defineManifest({
  manifest_version: 3,
  name: '__MSG_extName__',
  short_name: 'UDB Aula Sync',
  description: '__MSG_extDescription__',
  version: pkg.version,
  default_locale: 'es',
  // 116: chrome.runtime.getContexts, used to lock the single offscreen document.
  minimum_chrome_version: '116',
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  action: {
    default_title: '__MSG_extName__',
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
    },
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: [...HOST_PERMISSIONS],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: [...PERMISSIONS],
  host_permissions: [...HOST_PERMISSIONS],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; base-uri 'none'",
  },
});
