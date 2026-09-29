import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { sanitizeDocument } from '../src/moodle/sanitize';

/**
 * Turns real material into an anonymized fixture:
 *   tsx scripts/sanitize-fixture.ts <page.html | diagnostico.json> <out.html> [--url <page url>]
 * A Diagnostics report is already sanitized; its HTML is sanitized again (idempotent).
 */

const DEFAULT_URL = 'https://www.udbvirtual.edu.sv/auladigital/course/view.php?id=1';

export interface FixtureResult {
  readonly html: string;
  readonly elements: number;
  readonly removedPersonal: number;
}

/** Sanitizes page HTML or a diagnostic report (JSON text). Pure apart from the date stamp. */
export function sanitizeFixture(
  input: string,
  isJson: boolean,
  urlOverride?: string,
  today = new Date(),
): FixtureResult {
  let html = input;
  let url = urlOverride ?? DEFAULT_URL;
  if (isJson) {
    const report = JSON.parse(input) as { kind?: string; html?: string; page?: string };
    if (report.kind !== 'udbsync-diagnostic' || typeof report.html !== 'string') {
      throw new Error('not a UDB Aula Sync diagnostic report');
    }
    html = report.html;
    if (typeof report.page === 'string' && urlOverride === undefined) url = report.page;
  }
  const doc = new JSDOM(html, { url }).window.document;
  const result = sanitizeDocument(doc, url);
  const source = new URL(url);
  const header = `<!-- Real page, sanitized by scripts/sanitize-fixture.ts on ${today.toISOString().slice(0, 10)}. Source URL: ${source.pathname}${source.search} -->\n`;
  return {
    html: result.html.replace('<!DOCTYPE html>\n', `<!DOCTYPE html>\n${header}`),
    elements: result.elements,
    removedPersonal: result.removedPersonal,
  };
}

function main(argv: readonly string[]): number {
  const [input, output, flag, flagValue] = argv;
  if (input === undefined || output === undefined) {
    console.error(
      'usage: sanitize-fixture <page.html | diagnostico.json> <out.html> [--url <url>]',
    );
    return 2;
  }
  try {
    const url = flag === '--url' ? flagValue : undefined;
    const result = sanitizeFixture(readFileSync(input, 'utf8'), input.endsWith('.json'), url);
    writeFileSync(output, result.html);
    console.log(
      `${output}: ${result.elements} elements, ${result.removedPersonal} personal subtrees removed`,
    );
    return 0;
  } catch (cause) {
    console.error(`sanitize-fixture: ${cause instanceof Error ? cause.message : String(cause)}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exit(main(process.argv.slice(2)));
