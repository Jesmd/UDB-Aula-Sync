import { appError, isAppError, type AppError } from './errors';
import type { ResponseFor, RuntimeMessage } from './messages';
import { err, type Result } from './result';

/**
 * Thin wrapper over the chrome.* calls shared by several contexts. Keeps a single
 * place to swap if the extension is ever ported (for example to Firefox's browser.*).
 */

function isResult(value: unknown): value is Result<unknown, AppError> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false;
  if (value.ok === true) return 'value' in value;
  return value.ok === false && 'error' in value && isAppError(value.error);
}

export async function sendMessage<M extends RuntimeMessage>(message: M): Promise<ResponseFor<M>> {
  try {
    const response: unknown = await chrome.runtime.sendMessage(message);
    if (isResult(response)) return response as ResponseFor<M>;
    return err(appError('invalid_message', 'malformed response'));
  } catch (cause) {
    return err(appError('unknown', cause instanceof Error ? cause.message : String(cause)));
  }
}

export function extensionVersion(): string {
  return chrome.runtime.getManifest().version;
}
