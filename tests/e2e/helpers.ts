import type { Page } from '@playwright/test';
import { expect, type MockControl } from './fixtures';

/** Hover until the content script has resolved the file (view.php + pluginfile headers). */
export async function hoverAndResolve(page: Page, mock: MockControl, cmid: number) {
  const count = async () =>
    (await mock.requests()).filter((r) => r.includes(`view.php?id=${cmid}&redirect=1`)).length;
  const before = await count();
  // After a reload the pointer may already sit on the link: leave first so "mouseover" fires.
  await page.mouse.move(0, 0);
  await page.locator(`#module-${cmid} a.aalink`).hover();
  await expect.poll(count).toBeGreaterThan(before);
  // Give the resolution a moment to land in the cache after its last request.
  await page.waitForTimeout(300);
}
