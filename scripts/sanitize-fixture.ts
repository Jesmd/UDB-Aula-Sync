import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { sanitizeDocument } from '../src/moodle/sanitize';

/**
 * Turns real material into an anonymized fixture:
 *   tsx scripts/sanitize-fixture.ts <page.html | diagnostico.json> <out.html> [--url <page url>]
 * A Diagnostics report is already sanitized; its HTML is sanitized again (idempotent).
 */
const [input, output, flag, flagValue] = process.argv.slice(2);
if (input === undefined || output === undefined) {
  console.error('usage: sanitize-fixture <page.html | diagnostico.json> <out.html> [--url <url>]');
  process.exit(2);
}

let html = readFileSync(input, 'utf8');
let url =
  flag === '--url' && flagValue !== undefined
    ? flagValue
    : 'https://www.udbvirtual.edu.sv/auladigital/course/view.php?id=1';
if (input.endsWith('.json')) {
  const report = JSON.parse(html) as { kind?: string; html?: string; page?: string };
  if (report.kind !== 'udbsync-diagnostic' || typeof report.html !== 'string') {
    console.error('sanitize-fixture: not a UDB Aula Sync diagnostic report');
    process.exit(1);
  }
  html = report.html;
  if (typeof report.page === 'string' && flag !== '--url') url = report.page;
}

const doc = new JSDOM(html, { url }).window.document;
const result = sanitizeDocument(doc, url);
const header = `<!-- Real page, sanitized by scripts/sanitize-fixture.ts on ${new Date().toISOString().slice(0, 10)}. Source URL: ${new URL(url).pathname}${new URL(url).search} -->\n`;
writeFileSync(output, result.html.replace('<!DOCTYPE html>\n', `<!DOCTYPE html>\n${header}`));
console.log(
  `${output}: ${result.elements} elements, ${result.removedPersonal} personal subtrees removed`,
);
