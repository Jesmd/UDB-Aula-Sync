import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The CHANGELOG section of one version, for the GitHub release page. */
export function releaseNotes(changelog: string, version: string): string {
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start < 0) return `Versión ${version}.`;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## ['));
  const body = lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
  return `${body}\n\nInstalación: descarga el zip de abajo y sigue la guía del README.\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  writeFileSync('release/notes.md', releaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version));
  console.log(`release/notes.md (${version})`);
}
