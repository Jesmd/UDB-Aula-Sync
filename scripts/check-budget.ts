import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Spec §8: the content script (with everything it imports) stays under 60 KB gzip. */
export const CONTENT_BUDGET_BYTES = 60 * 1024;

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+\.js)["']/g;
/** crxjs loaders import the real chunk by extension URL (relative to the extension root). */
const EXTENSION_URL = /getURL\(\s*["']([^"']+\.js)["']/g;

/** Every file reachable from `entry` through relative static or dynamic imports. */
export function importGraph(root: string, entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    const key = normalize(file);
    if (seen.has(key) || !existsSync(join(root, key))) return;
    seen.add(key);
    const code = readFileSync(join(root, key), 'utf8');
    for (const match of code.matchAll(IMPORT)) {
      const target = match[1];
      if (target !== undefined) visit(join(dirname(key), target));
    }
    for (const match of code.matchAll(EXTENSION_URL)) {
      const target = match[1];
      if (target !== undefined) visit(target.replace(/^\//, ''));
    }
  };
  visit(entry);
  return [...seen];
}

export function gzipSize(root: string, files: readonly string[]): number {
  return files.reduce((sum, f) => sum + gzipSync(readFileSync(join(root, f))).length, 0);
}

function main(root: string): number {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as {
    content_scripts?: { js?: string[] }[];
  };
  const entries = (manifest.content_scripts ?? []).flatMap((c) => c.js ?? []);
  const files = [...new Set(entries.flatMap((e) => importGraph(root, e)))];
  const size = gzipSize(root, files);
  const line = `check-budget: content script ${(size / 1024).toFixed(1)} KB gzip in ${files.length} files (budget ${CONTENT_BUDGET_BYTES / 1024} KB)`;
  if (size > CONTENT_BUDGET_BYTES) {
    console.error(`${line}\n  ${files.map((f) => relative('.', f)).join('\n  ')}`);
    return 1;
  }
  console.log(line);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv[2] ?? 'dist'));
}
