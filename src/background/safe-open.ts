import { OPEN_ALLOWLIST } from '../shared/constants';
import type { DownloadBackend } from './download-manager';

/**
 * Types that are never opened automatically, even if someone adds them to the allowlist:
 * executables, scripts, macro-enabled Office files and archives (spec §6).
 */
const NEVER_OPEN = new Set([
  'exe',
  'msi',
  'bat',
  'cmd',
  'com',
  'scr',
  'ps1',
  'vbs',
  'js',
  'jse',
  'wsf',
  'hta',
  'jar',
  'sh',
  'app',
  'dmg',
  'pkg',
  'deb',
  'rpm',
  'apk',
  'lnk',
  'reg',
  'docm',
  'xlsm',
  'pptm',
  'dotm',
  'xltm',
  'potm',
  'ppsm',
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'bz2',
  'xz',
  'iso',
]);

export type OpenDecision = 'open' | 'show';

/** Allowlisted document types open; everything else is only shown in its folder. */
export function openDecision(extension: string): OpenDecision {
  const ext = extension.toLowerCase();
  return !NEVER_OPEN.has(ext) && OPEN_ALLOWLIST.includes(ext) ? 'open' : 'show';
}

export type OpenOutcome = 'opened' | 'shown' | 'blocked';

/**
 * Opens (or shows) a finished download. chrome.downloads.open needs a recent user gesture
 * and the browser may ask for confirmation; "blocked" lets the UI offer an "Abrir" button,
 * whose click provides a fresh gesture (ADR-004).
 */
export async function safeOpen(
  backend: DownloadBackend,
  downloadId: number,
  extension: string,
): Promise<OpenOutcome> {
  if (openDecision(extension) === 'show') {
    const shown = await backend.show(downloadId);
    return shown.ok ? 'shown' : 'blocked';
  }
  const opened = await backend.open(downloadId);
  return opened.ok ? 'opened' : 'blocked';
}
