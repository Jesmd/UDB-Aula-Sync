import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, UDB } from './fixtures';

const COURSE = `${UDB}/course/view.php?id=101&section=14`;
const WEEK_DIR = 'UDB/Estadística Aplicada ESA501 G01T/Desarrollo/Semana 12';

test('"tarjeta" mode shows the file details on hover and downloads from the card', async ({
  context,
  extPage,
  queue,
  downloadsDir,
}) => {
  await extPage.evaluate(() => chrome.storage.local.set({ settings: { hoverDetails: 'tarjeta' } }));
  const page = await context.newPage();
  await page.goto(COURSE);
  await page.locator('#module-2102 a.aalink').hover();

  const card = page.locator('#udbsync-overlay .udbsync-card');
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toContainText('Presentación Semana 12.pptx');
  await expect(card).toContainText('PPTX');
  await expect(card).toContainText('240 KB');
  await expect(card).toContainText(`${WEEK_DIR}/Presentación Semana 12.pptx`);
  await expect(card).toContainText('Nuevo');
  await expect(page.locator('#udbsync-overlay .udbsync-pill[data-cmid="2102"]')).toHaveAttribute(
    'data-status',
    'nuevo',
  );

  await card.getByRole('button', { name: 'Descargar' }).click();
  await expect(card).toBeHidden();
  const expected = join(downloadsDir, WEEK_DIR, 'Presentación Semana 12.pptx');
  await expect.poll(() => existsSync(expected), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await queue()).files.length).toBe(1);
  await expect(page.locator('#udbsync-overlay .udbsync-pill[data-cmid="2102"]')).toHaveAttribute(
    'data-status',
    'descargado',
  );
});

test('keyboard focus shows the card in the default mode; Escape closes it', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(COURSE);
  await page.locator('#module-2103 a.aalink').focus();
  const card = page.locator('#udbsync-overlay .udbsync-card');
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toContainText('Guía de ejercicios - TLC.pdf');
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();

  // Mouse hover in "simple" mode keeps to the small badge (no card).
  await page.locator('#module-2104 a.aalink').hover();
  await page.waitForTimeout(1_000);
  await expect(card).toBeHidden();
});

test('read-only files say so and offer no download', async ({ context, extPage, mock }) => {
  await extPage.evaluate(() => chrome.storage.local.set({ settings: { hoverDetails: 'tarjeta' } }));
  // The fixture has no read-only resource: turn 2104 into a viewer-only one.
  await mock.setResource(2104, { mode: 'readonly' });
  const page = await context.newPage();
  await page.goto(COURSE);
  await page.locator('#module-2104 a.aalink').hover();
  const card = page.locator('#udbsync-overlay .udbsync-card');
  await expect(card).toContainText('Solo lectura', { timeout: 10_000 });
  await expect(card.getByRole('button', { name: 'Descargar' })).toBeHidden();
});
