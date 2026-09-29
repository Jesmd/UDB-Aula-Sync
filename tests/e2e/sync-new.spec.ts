import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import {
  badge,
  COURSE_103,
  COURSE_103_DIR,
  downloadWholeCourse,
  fireSyncAlarm,
  notifications,
  openPopup,
  publishNews,
} from './sync-helpers';

test('a course is never checked before its first manual sync', async ({
  context,
  extensionId,
  mock,
}) => {
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId('sync-status')).toContainText('Aún no sigue ningún curso');
  await expect(popup.getByRole('button', { name: 'Sincronizar ahora' })).toBeDisabled();
  await fireSyncAlarm(popup);
  await popup.waitForTimeout(1_500);
  expect(await mock.requests()).toEqual([]);
});

test('news on the server show up as a badge, one notification and NUEVO marks', async ({
  context,
  extensionId,
  mock,
}) => {
  const page = await downloadWholeCourse(context);
  await publishNews(context);
  const before = (await mock.requests()).length;

  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId('sync-status')).toContainText('Sigue 1 cursos');
  await popup.getByRole('button', { name: 'Sincronizar ahora' }).click();
  await expect(popup.getByTestId('sync-result')).toHaveText('2 novedades en 1 cursos revisados.', {
    timeout: 20_000,
  });
  expect(await badge(popup)).toBe('2');
  expect(await notifications(popup)).toEqual(['udbsync-novelties']);
  await expect(popup.getByTestId('course-list')).toContainText('2 nuevos');
  // Page + the one unknown resource (view.php + pluginfile): known files are not probed again.
  const syncRequests = (await mock.requests()).slice(before);
  expect(syncRequests.filter((r) => r.includes('mod/resource/view.php'))).toEqual([
    'GET /auladigital/mod/resource/view.php?id=4501&redirect=1',
  ]);

  // The page marks it; downloading it clears that novelty.
  await page.goto(COURSE_103);
  const pill = page.locator('#udbsync-overlay .udbsync-pill[data-cmid="4501"]');
  await expect(pill).toHaveAttribute('data-status', 'nuevo');
  await page.locator('#module-4501 a.aalink').click({ modifiers: ['Alt'] });
  await expect(pill).toHaveAttribute('data-status', 'descargado', { timeout: 15_000 });
  await expect.poll(() => badge(popup)).toBe('1');

  // Nothing new since: no second notification.
  await popup.evaluate(() => chrome.notifications.clear('udbsync-novelties'));
  await popup.getByRole('button', { name: 'Sincronizar ahora' }).click();
  await expect(popup.getByTestId('sync-result')).toHaveText('Sin novedades en 1 cursos.', {
    timeout: 20_000,
  });
  expect(await notifications(popup)).toEqual([]);

  // Never more than 2 requests at once (spec §2).
  expect(await mock.maxInFlight()).toBeLessThanOrEqual(2);

  await popup.getByRole('button', { name: 'Marcar todo como visto' }).click();
  await expect.poll(() => badge(popup)).toBe('');
});

test('with auto-download on, the periodic sync downloads the news', async ({
  context,
  extensionId,
  downloadsDir,
}) => {
  await downloadWholeCourse(context);
  const popup = await openPopup(context, extensionId);
  await popup.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        courses: {
          '103': {
            template: null,
            skipSections: [],
            excludedExtensions: null,
            maxSizeMb: null,
            autoDownload: true,
          },
        },
      },
    }),
  );
  await publishNews(context);
  await fireSyncAlarm(popup);
  const file = join(downloadsDir, COURSE_103_DIR, 'Tema 05', 'Guía 5.pdf');
  await expect.poll(() => existsSync(file), { timeout: 30_000 }).toBe(true);
  // Downloaded, so only the opened section is still new.
  await expect.poll(() => badge(popup), { timeout: 10_000 }).toBe('1');
});
