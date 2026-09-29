import { extensionVersion } from '../shared/browser-api';
import { appError } from '../shared/errors';
import { parseMessage } from '../shared/messages';
import { err, ok } from '../shared/result';
import { buildDiagnosticReport } from '../moodle/diagnostic';
import { domParser } from '../moodle/html-parser';
import { testHypotheses } from '../moodle/hypotheses';

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Answers Diagnostics requests from the popup: a structure-only report, or (with the
 * user's consent in the popup) a few requests that check H1, H2, H4-H6. Only extension
 * pages (no tab) may ask; nothing leaves the browser unless the user shares the file.
 */
export function registerDiagnostics(): void {
  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || sender.tab !== undefined) return false;
    const parsed = parseMessage(raw);
    if (!parsed.ok || parsed.value.target !== 'content') return false;
    const toError = (cause: unknown) =>
      err(appError('unknown', cause instanceof Error ? cause.message : String(cause)));

    if (parsed.value.type === 'content/diagnose') {
      try {
        sendResponse(ok(buildDiagnosticReport(document, location.href, extensionVersion())));
      } catch (cause) {
        sendResponse(toError(cause));
      }
      return false;
    }
    testHypotheses(document, location.href, {
      fetch: (i, init) => fetch(i, init),
      parseHtml: domParser,
      wait,
    }).then(
      (report) => {
        sendResponse(ok(report));
      },
      (cause: unknown) => {
        sendResponse(toError(cause));
      },
    );
    return true;
  });
}
