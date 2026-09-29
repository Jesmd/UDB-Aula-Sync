import { JSDOM } from 'jsdom';
import type { HtmlParser } from '../../src/moodle/html-parser';

/** jsdom stand-in for DOMParser (Node has no DOM). */
export const jsdomParser: HtmlParser = (html) => new JSDOM(html).window.document;
