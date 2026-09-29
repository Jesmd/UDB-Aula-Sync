import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';

/** Packs dist/ into release/udb-aula-sync-<version>.zip for "load unpacked" distribution. */
const DIST = 'dist';

function collect(dir: string, files: Record<string, Uint8Array>): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, files);
    else files[relative(DIST, full).split('\\').join('/')] = readFileSync(full);
  }
}

const { version } = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8')) as {
  version: string;
};
const files: Record<string, Uint8Array> = {};
collect(DIST, files);
mkdirSync('release', { recursive: true });
const out = `release/udb-aula-sync-${version}.zip`;
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`${out} (${Object.keys(files).length} files)`);
