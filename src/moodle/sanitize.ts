import { redact } from '../shared/logger';
import { queryAll } from './dom';
import { SELECTORS } from './selectors';

/**
 * Structure-only copy of a Moodle page for Diagnostics and real fixtures.
 * Keeps tags, safe attributes, section/activity names; drops scripts, personal
 * subtrees, free text, form values and identifying URL parameters.
 */

const DROP_ELEMENTS = 'script, style, noscript, template, link, svg, canvas, textarea';

const ALLOWED_ATTRIBUTES = new Set([
  'id',
  'class',
  'role',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-current',
  'aria-selected',
  'aria-disabled',
  'aria-hidden',
  'aria-controls',
  'aria-expanded',
  'title',
  'alt',
  'href',
  'src',
  'data',
  'action',
  'method',
  'type',
  'name',
  'for',
  'lang',
  'dir',
  'width',
  'height',
  'charset',
]);
const URL_ATTRIBUTES = new Set(['href', 'src', 'data', 'action']);
const TEXT_ATTRIBUTES = new Set(['aria-label', 'title', 'alt']);

/** Text kept verbatim (redacted, truncated) inside these; other text becomes a placeholder. */
const KEEP_TEXT = [
  'title',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'button',
  '.sectionname',
  '.instancename',
  '.activityname',
  '.nav-link',
  '.breadcrumb',
  '.resourcelinkdetails',
  '.availabilityinfo',
  '.section_availability',
  '.contentwithoutlink',
].join(', ');

const TEXT_PLACEHOLDER = '[texto]';
const MAX_TEXT = 200;
const SAFE_ID =
  /^(section|module|region|page|nav|tabs?|onetopic|course|maincontent|login|resource|folder|intro)[\w-]*$/i;
const SAFE_CLASS = /^[A-Za-z_][\w-]{0,60}$/;
const SAFE_DATA_VALUE = /^[\w-]{0,40}$/;
const KEEP_PARAM_VALUES = new Set([
  'id',
  'section',
  'redirect',
  'forceview',
  'forcedownload',
  'lang',
]);
const DROP_PARAMS = new Set(['sesskey', 'token', 'logintoken', 'key', 'wstoken']);
const SAFE_HASH = /^#(section|module)-\d+$/;
const PERSONAL_PATH = /^\/(?:[^/]+\/)?(user|message|badges|grade\/report\/user|blog|calendar)\//;

function truncate(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

/** Normalizes a URL so it shows structure without identifying data. */
export function sanitizeUrl(value: string, baseUrl: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('data:')) return 'data:[removed]';
  if (trimmed === '' || trimmed.startsWith('#')) return SAFE_HASH.test(trimmed) ? trimmed : '#';
  let url: URL;
  try {
    url = new URL(trimmed, baseUrl);
  } catch {
    return '[url]';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '[url]';
  const base = new URL(baseUrl);
  if (url.host !== base.host) return `${url.protocol}//${url.host}/[external]`;
  if (PERSONAL_PATH.test(url.pathname)) return `${url.origin}/[personal]`;

  const params = new URLSearchParams();
  for (const [key, val] of url.searchParams) {
    if (DROP_PARAMS.has(key.toLowerCase())) continue;
    params.append(key, KEEP_PARAM_VALUES.has(key) && /^[\w-]{0,20}$/.test(val) ? val : 'x');
  }
  const query = params.toString();
  const hash = SAFE_HASH.test(url.hash) ? url.hash : '';
  return `${url.origin}${url.pathname}${query === '' ? '' : `?${query}`}${hash}`;
}

function sanitizeAttributes(element: Element, baseUrl: string): void {
  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    if (name.startsWith('data-')) {
      if (!SAFE_DATA_VALUE.test(value)) element.setAttribute(name, 'x');
      continue;
    }
    if (!ALLOWED_ATTRIBUTES.has(name)) {
      element.removeAttribute(attr.name);
    } else if (URL_ATTRIBUTES.has(name)) {
      element.setAttribute(name, sanitizeUrl(value, baseUrl));
    } else if (TEXT_ATTRIBUTES.has(name)) {
      element.setAttribute(name, truncate(redact(value)));
    } else if (name === 'id' && !SAFE_ID.test(value)) {
      element.removeAttribute('id');
    } else if (name === 'class') {
      element.setAttribute(
        'class',
        value
          .split(/\s+/)
          .filter((c) => SAFE_CLASS.test(c))
          .join(' '),
      );
    }
  }
}

function sanitizeText(root: Element): void {
  const doc = root.ownerDocument;
  // SHOW_TEXT = 4; the constant is not read from a global so any DOM implementation works.
  const walker = doc.createTreeWalker(root, 4);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
    texts.push(node as Text);
  for (const text of texts) {
    const value = text.data;
    if (value.trim() === '') continue;
    const keep = (text.parentElement?.closest(KEEP_TEXT) ?? null) !== null;
    text.data = keep ? truncate(redact(value.replace(/\s+/g, ' '))) : TEXT_PLACEHOLDER;
  }
}

export interface SanitizeResult {
  readonly html: string;
  readonly removedPersonal: number;
  readonly elements: number;
}

export function sanitizeDocument(doc: Document, baseUrl: string): SanitizeResult {
  const root = doc.documentElement.cloneNode(true) as Element;

  for (const node of Array.from(root.querySelectorAll(DROP_ELEMENTS))) node.remove();
  let removedPersonal = 0;
  for (const selector of SELECTORS.personal) {
    for (const node of queryAll(root, [selector])) {
      node.replaceWith(doc.createComment(' udbsync: personal data removed '));
      removedPersonal += 1;
    }
  }
  for (const input of Array.from(root.querySelectorAll('input, option')))
    input.removeAttribute('value');

  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const element of elements) sanitizeAttributes(element, baseUrl);
  sanitizeText(root);

  // Serializing (not injecting) HTML; the output is a file, never inserted into a page.
  // eslint-disable-next-line no-restricted-properties
  const html = `<!DOCTYPE html>\n${root.outerHTML}\n`;
  return { html, removedPersonal, elements: elements.length };
}
