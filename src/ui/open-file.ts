import { openDecision } from '../background/safe-open';

/**
 * "Abrir" from an extension page. Must run inside the user's click: chrome.downloads.open
 * needs the gesture (ADR-016), so callers look the download up before the click.
 * Types outside the allowlist are never opened; they are shown in their folder instead.
 */
export function openOrShow(downloadId: number, extension: string): Promise<void> {
  if (openDecision(extension) !== 'open') {
    chrome.downloads.show(downloadId);
    return Promise.resolve();
  }
  return chrome.downloads.open(downloadId);
}
