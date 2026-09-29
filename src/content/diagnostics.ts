import { extensionVersion } from '../shared/browser-api';
import { appError } from '../shared/errors';
import { parseMessage } from '../shared/messages';
import { err, ok } from '../shared/result';
import { buildDiagnosticReport } from '../moodle/diagnostic';

/**
 * Answers "content/diagnose" from the popup with a structure-only report of this page.
 * Only extension pages (no tab) may ask; the report never leaves the browser unless the
 * user saves and shares it.
 */
export function registerDiagnostics(): void {
  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || sender.tab !== undefined) return false;
    const parsed = parseMessage(raw);
    if (!parsed.ok || parsed.value.target !== 'content') return false;
    try {
      sendResponse(ok(buildDiagnosticReport(document, location.href, extensionVersion())));
    } catch (cause) {
      sendResponse(
        err(appError('unknown', cause instanceof Error ? cause.message : String(cause))),
      );
    }
    return false;
  });
}
