import { expect, test } from './fixtures';
import {
  COURSE_103,
  downloadWholeCourse,
  fireSyncAlarm,
  notifications,
  openPopup,
} from './sync-helpers';

const siteRequests = (requests: string[]) => requests.filter((r) => !r.includes('/login/'));

test('a lost session stops the sync, notifies once and makes no more requests', async ({
  context,
  extensionId,
  mock,
}) => {
  const page = await downloadWholeCourse(context);
  const popup = await openPopup(context, extensionId);
  await mock.setSession(false);
  const before = siteRequests(await mock.requests()).length;

  await popup.getByRole('button', { name: 'Sincronizar ahora' }).click();
  await expect(popup.getByTestId('sync-result')).toHaveText(
    'Tu sesión del Aula Digital caducó. Inicia sesión de nuevo.',
    { timeout: 20_000 },
  );
  // One request (the course page, sent to the login form), then nothing.
  expect(siteRequests(await mock.requests()).length).toBe(before + 1);
  expect(await notifications(popup)).toEqual(['udbsync-session']);
  await expect(popup.getByText('La búsqueda automática está en pausa')).toBeVisible();

  // Background runs stay quiet: zero requests, no second notification.
  await popup.evaluate(() => chrome.notifications.clear('udbsync-session'));
  const held = (await mock.requests()).length;
  await fireSyncAlarm(popup);
  await popup.waitForTimeout(2_000);
  expect((await mock.requests()).length).toBe(held);
  expect(await notifications(popup)).toEqual([]);

  // Logging in again (any Aula Digital page other than the login form) lifts the hold.
  await mock.setSession(true);
  await page.goto(COURSE_103);
  await expect(popup.getByText('La búsqueda automática está en pausa')).toBeHidden();
  const resumed = (await mock.requests()).length;
  await fireSyncAlarm(popup);
  await expect
    .poll(async () => (await mock.requests()).slice(resumed).some((r) => r.includes('id=103')))
    .toBe(true);
});
