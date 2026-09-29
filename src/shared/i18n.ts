/** Type-only import: the JSON is not bundled. Spanish is the default locale and the key source. */
import type es from '../_locales/es/messages.json';

export type MessageKey = keyof typeof es;

export type MessageLookup = (key: string, substitutions?: string | string[]) => string;

const chromeLookup: MessageLookup = (key, substitutions) =>
  typeof chrome !== 'undefined' && typeof chrome.i18n !== 'undefined'
    ? chrome.i18n.getMessage(key, substitutions)
    : '';

let lookup: MessageLookup = chromeLookup;

/** Test seam: replace the message source. Pass undefined to restore chrome.i18n. */
export function setMessageLookup(next: MessageLookup | undefined): void {
  lookup = next ?? chromeLookup;
}

/** Translates a key. Falls back to the key itself so a missing string is visible, not blank. */
export function t(key: MessageKey, substitutions?: string | string[]): string {
  const text = lookup(key, substitutions);
  return text === '' ? key : text;
}
