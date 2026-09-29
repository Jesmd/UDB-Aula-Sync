/**
 * Error taxonomy. Codes are stable identifiers; user-facing text lives in _locales
 * under "error_<code>" and is resolved by the UI, never stored.
 */
export const ERROR_CODES = [
  'unknown',
  'invalid_message',
  'unsupported_message',
  'session_expired',
  'not_course_page',
  'network',
  'http_status',
  'rate_limited',
  'not_downloadable',
  'download_interrupted',
  'disk_full',
  'file_rejected',
  'cancelled',
  'verification_failed',
  'invalid_transition',
  'open_blocked',
  'offscreen_unavailable',
  'storage',
  'unsafe_path',
  'invalid_template',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AppError {
  readonly code: ErrorCode;
  /** Developer-facing detail in English. Must not contain personal data. */
  readonly detail?: string;
}

export function appError(code: ErrorCode, detail?: string): AppError {
  return detail === undefined ? { code } : { code, detail };
}

export function toAppError(cause: unknown, code: ErrorCode = 'unknown'): AppError {
  if (isAppError(cause)) return cause;
  if (cause instanceof Error) return appError(code, cause.message);
  return appError(code, String(cause));
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'string' &&
    (ERROR_CODES as readonly string[]).includes(value.code)
  );
}
