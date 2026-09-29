import { sendMessage } from '../shared/browser-api';

/**
 * M0 check for ADR-004: does chrome.downloads.open work (a) in an extension page click
 * handler and (b) from the worker, which has no user gesture? The test file is a tiny
 * local text file; nothing is fetched from the network.
 */

const TEST_FILENAME = 'UDB/_prueba/udbsync-prueba.txt';
const TEST_URL = `data:text/plain;charset=utf-8,${encodeURIComponent('UDB Aula Sync: archivo de prueba.\n')}`;

function waitForComplete(downloadId: number, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      finish('timeout (¿diálogo "Preguntar dónde guardar" abierto?)');
    }, timeoutMs);
    const listener = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== downloadId) return;
      if (delta.state?.current === 'complete') finish('complete');
      if (delta.state?.current === 'interrupted')
        finish(`interrupted: ${delta.error?.current ?? '?'}`);
    };
    const finish = (state: string) => {
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(listener);
      resolve(state);
    };
    chrome.downloads.onChanged.addListener(listener);
  });
}

async function tryOpen(downloadId: number): Promise<string> {
  try {
    await chrome.downloads.open(downloadId);
    return 'opened (o el navegador mostró su confirmación)';
  } catch (cause) {
    return `error: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

export async function runDownloadOpenSpike() {
  const downloadId = await chrome.downloads.download({
    url: TEST_URL,
    filename: TEST_FILENAME,
    conflictAction: 'overwrite',
    saveAs: false,
  });
  const state = await waitForComplete(downloadId);
  const [item] = await chrome.downloads.search({ id: downloadId });
  const openFromPage = state === 'complete' ? await tryOpen(downloadId) : 'skipped';
  const openFromWorker =
    state === 'complete'
      ? await sendMessage({ target: 'background', type: 'spike/open-via-worker', downloadId })
      : 'skipped';
  return {
    download: { state, filename: item?.filename, exists: item?.exists },
    openFromPage,
    openFromWorker,
  };
}
