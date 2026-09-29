import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

export const FIXTURES = 'tests/fixtures/moodle';
export const UDB_ROOT = 'https://www.udbvirtual.edu.sv/auladigital/';

export function readFixture(path: string): string {
  return readFileSync(join(FIXTURES, path), 'utf8');
}

/** Parses a fixture as the browser would at the given URL. Scripts never run. */
export function loadFixture(path: string, url: string): Document {
  return new JSDOM(readFixture(path), { url }).window.document;
}

export const courseUrl = (id: number, section?: number): string =>
  `${UDB_ROOT}course/view.php?id=${id}${section === undefined ? '' : `&section=${section}`}`;
