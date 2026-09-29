import { sendMessage } from '../shared/browser-api';
import { appError, type AppError } from '../shared/errors';
import type { OffscreenRequest, ResponseFor } from '../shared/messages';
import { err, fromPromise, type Result } from '../shared/result';

export const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';

/** Chrome allows one offscreen document per extension; this promise serializes creation. */
let creating: Promise<void> | undefined;

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
  });
  return contexts.length > 0;
}

export async function ensureOffscreenDocument(): Promise<Result<void, AppError>> {
  return fromPromise(
    async () => {
      if (await hasOffscreenDocument()) return;
      creating ??= chrome.offscreen
        .createDocument({
          url: OFFSCREEN_PATH,
          reasons: ['DOM_PARSER'],
          justification: 'Parse Moodle course pages fetched in the background.',
        })
        .finally(() => {
          creating = undefined;
        });
      await creating;
    },
    (cause) =>
      appError('offscreen_unavailable', cause instanceof Error ? cause.message : String(cause)),
  );
}

export async function sendToOffscreen<M extends OffscreenRequest>(
  message: M,
): Promise<ResponseFor<M>> {
  const ready = await ensureOffscreenDocument();
  if (!ready.ok) return err(ready.error);
  return sendMessage(message);
}
