/**
 * Port for turning fetched HTML into a Document. The content script uses the live
 * document; the offscreen document (M5) and tests pass their own implementation.
 */
export type HtmlParser = (html: string) => Document;

export const domParser: HtmlParser = (html) => new DOMParser().parseFromString(html, 'text/html');
