import { MOODLE_ROOT_URL } from '../shared/constants';

/** Active tab id when it shows Aula Digital. Without "tabs", url is only visible for our host. */
export async function activeUdbTab(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id !== undefined && tab.url?.startsWith(MOODLE_ROOT_URL) === true ? tab.id : null;
}

/** Saves a JSON report under Downloads/UDB/_diagnostico/. Returns the relative path. */
export async function saveReport(name: string, data: unknown): Promise<string> {
  const path = `UDB/_diagnostico/${name}.json`;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  try {
    await chrome.downloads.download({
      url,
      filename: path,
      saveAs: false,
      conflictAction: 'uniquify',
    });
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
  }
  return path;
}

export const stamp = (iso: string): string => iso.replace(/[:.]/g, '-').slice(0, 19);
