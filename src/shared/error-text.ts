import { ERROR_CODES, type ErrorCode } from './errors';
import { t } from './i18n';

const KNOWN: ReadonlySet<string> = new Set(ERROR_CODES);

/**
 * The Spanish (or English) sentence for an error code. Codes arrive from messages and the
 * worker as plain strings; anything unknown reads as the generic error, never as a key.
 */
export function errorMessage(code: string | null | undefined): string {
  const known = code != null && KNOWN.has(code) ? (code as ErrorCode) : 'unknown';
  return t(`error_${known}`);
}
