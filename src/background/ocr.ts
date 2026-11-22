import { t } from '../shared/i18n';
import { loadSettings } from '../storage/settings';

// Copy text from an image (opt-in). The shortcut or the context menu captures the visible tab
// and opens src/ocr/index.html, where the user drags over the text. Nothing is saved or sent.
const MENU_ID = 'udbsync-ocr';
const COMMAND = 'copiar-texto-imagen';
/** Shared with src/ocr/ocr.ts. The screenshot lives in session storage only until the page reads it. */
export const OCR_SHOT_KEY = 'ocrShot';

async function ocrEnabled(): Promise<boolean> {
  return (await loadSettings()).ocrEnabled;
}

async function syncMenu(): Promise<void> {
  await chrome.contextMenus.removeAll();
  if (!(await ocrEnabled())) return;
  chrome.contextMenus.create({ id: MENU_ID, title: t('ocrMenu'), contexts: ['all'] });
}

async function startSnip(clicked?: chrome.tabs.Tab): Promise<void> {
  if (!(await ocrEnabled())) return;
  const tab = clicked ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (tab?.id === undefined) return;
  let shot: string;
  try {
    shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } catch {
    // Chrome internal pages and the Web Store cannot be captured.
    void chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: t('ocrTitle'),
      message: t('ocrCaptureFailed'),
    });
    return;
  }
  await chrome.storage.session.set({ [OCR_SHOT_KEY]: shot });
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`src/ocr/index.html?opener=${String(tab.id)}`),
    index: tab.index + 1,
    openerTabId: tab.id,
    windowId: tab.windowId,
  });
}

chrome.runtime.onInstalled.addListener(() => void syncMenu());
chrome.runtime.onStartup.addListener(() => void syncMenu());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'settings' in changes) void syncMenu();
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) void startSnip(tab);
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === COMMAND) void startSnip(tab);
});
