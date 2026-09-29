import { SELECTORS } from './selectors';

export type SelectorList = readonly string[];

/** First element matched by the first alternative that matches anything. */
export function queryFirst(root: ParentNode, selectors: SelectorList): Element | null {
  for (const selector of selectors) {
    const found = root.querySelector(selector);
    if (found !== null) return found;
  }
  return null;
}

/** All elements of the first alternative that matches anything. */
export function queryAll(root: ParentNode, selectors: SelectorList): Element[] {
  for (const selector of selectors) {
    const found = root.querySelectorAll(selector);
    if (found.length > 0) return Array.from(found);
  }
  return [];
}

export function hasAnyClass(element: Element | null, classes: readonly string[]): boolean {
  return element !== null && classes.some((c) => element.classList.contains(c));
}

/** Collapses whitespace, strips decorative stars and normalizes to NFC. */
export function cleanText(text: string): string {
  return text
    .replace(/[★☆⭐]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');
}

/** Visible text without screen-reader-only suffixes. */
export function visibleText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const hidden of queryAll(clone, SELECTORS.accessHide)) hidden.remove();
  return cleanText(clone.textContent);
}

export function courseContentRoot(doc: Document): ParentNode {
  return queryFirst(doc, SELECTORS.courseContent) ?? doc;
}

/** Resolves an href against the document URL; null for empty or non-http links. */
export function absoluteUrl(href: string | null, base: string): string | null {
  if (href === null || href.trim() === '' || href.startsWith('#')) return null;
  try {
    const url = new URL(href, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function intParam(url: string, name: string): number | null {
  try {
    const value = new URL(url).searchParams.get(name);
    return value !== null && /^\d+$/.test(value) ? Number(value) : null;
  } catch {
    return null;
  }
}
