import { openDecision } from '../background/safe-open';
import { sendMessage } from '../shared/browser-api';
import { t } from '../shared/i18n';

/**
 * Framed inside a toast on the Aula Digital page. The buttons call chrome.downloads
 * directly from this extension page, inside the user's click (ADR-016). Only files the
 * index knows can be opened; the page only passes an id.
 */

const byId = (id: string) => document.getElementById(id) as HTMLButtonElement | null;
const openButton = byId('open');
const showButton = byId('show');
const status = document.getElementById('status');

function fail(text: string): void {
  if (status !== null) status.textContent = text;
}

async function main(): Promise<void> {
  if (openButton === null || showButton === null) return;
  openButton.textContent = t('dlOpen');
  showButton.textContent = t('dlShow');

  const fileId = new URLSearchParams(location.search).get('id') ?? '';
  const file = await sendMessage({ target: 'background', type: 'files/get', fileId });
  if (!file.ok) {
    fail(t('dlOpenUnavailable'));
    return;
  }
  const { downloadId, extension } = file.value;
  // Types outside the allowlist are never opened automatically; "Abrir" shows them instead.
  const canOpen = openDecision(extension) === 'open';

  openButton.disabled = false;
  showButton.disabled = false;
  openButton.addEventListener('click', () => {
    fail('');
    if (!canOpen) {
      chrome.downloads.show(downloadId);
      return;
    }
    chrome.downloads.open(downloadId).catch((cause: unknown) => {
      fail(`${t('dlOpenFailed')} ${cause instanceof Error ? cause.message : ''}`.trim());
    });
  });
  showButton.addEventListener('click', () => {
    fail('');
    chrome.downloads.show(downloadId);
  });
}

void main();
