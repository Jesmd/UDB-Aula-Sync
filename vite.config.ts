import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crx } from '@crxjs/vite-plugin';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
import manifest from './manifest.config';

const LOCALES_DIR = 'src/_locales';

/** Chrome reads _locales/ from the extension root; keep sources under src/ and emit them there. */
function copyLocales(): Plugin {
  return {
    name: 'udbsync-copy-locales',
    generateBundle() {
      for (const locale of readdirSync(LOCALES_DIR)) {
        const file = join(LOCALES_DIR, locale, 'messages.json');
        this.emitFile({
          type: 'asset',
          fileName: `_locales/${locale}/messages.json`,
          source: readFileSync(file, 'utf8'),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [preact(), crx({ manifest }), copyLocales()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    sourcemap: false,
    rollupOptions: {
      input: {
        offscreen: 'src/offscreen/offscreen.html',
      },
    },
  },
});
