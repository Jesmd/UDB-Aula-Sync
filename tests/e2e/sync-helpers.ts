import type { BrowserContext, Page } from '@playwright/test';
import { expect, UDB } from './fixtures';

export const COURSE_103 = `${UDB}/course/view.php?id=103`;
export const COURSE_103_DIR = 'UDB/Introducción a Redes IRD101 G02T';
const MOCK = 'https://127.0.0.1:8443';

/** "Descargar todo el curso" by hand: the manual first sync that starts tracking. */
export async function downloadWholeCourse(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(COURSE_103);
  const root = page.locator('#udbsync-root');
  await root.getByRole('button', { name: /Descargas del curso/ }).click();
  const panel = root.getByRole('region', { name: 'UDB Aula Sync' });
  await panel.getByRole('button', { name: 'Descargar todo el curso' }).click();
  await expect(panel.getByRole('status')).toContainText('Listo: 6 descargados', {
    timeout: 30_000,
  });
  return page;
}

/** Teacher side: a new PDF in "Tema 5" and "Tema 12" opens. */
export async function publishNews(context: BrowserContext): Promise<void> {
  const call = async (path: string) => {
    const response = await context.request.get(`${MOCK}${path}`);
    expect(response.ok()).toBe(true);
  };
  await call('/__test/activity?course=103&section=5&cmid=4501&name=Gu%C3%ADa%205');
  await call('/__test/reveal?course=103&section=12');
}

export async function openPopup(context: BrowserContext, extensionId: string): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  return popup;
}

export const badge = (page: Page) => page.evaluate(() => chrome.action.getBadgeText({}));
export const notifications = (page: Page) =>
  page.evaluate(async () => Object.keys(await chrome.notifications.getAll()));

/** Fires the periodic sync alarm now (unpacked extensions allow short alarms). */
export async function fireSyncAlarm(page: Page): Promise<void> {
  await page.evaluate(() => chrome.alarms.create('udbsync-sync', { when: Date.now() + 100 }));
}
