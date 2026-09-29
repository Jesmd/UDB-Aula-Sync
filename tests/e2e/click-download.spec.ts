import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, UDB, type MockControl } from './fixtures';
import { hoverAndResolve } from './helpers';

const WEEK_DIR = 'UDB/Estadística Aplicada ESA501 G01T/Desarrollo/Semana 12';
const COURSE = `${UDB}/course/view.php?id=101&section=14`;

const pluginfileGets = async (mock: MockControl, contextId: number) =>
  (await mock.requests()).filter((r) =>
    r.startsWith(`GET /auladigital/pluginfile.php/${contextId}/`),
  ).length;

test('first click downloads into the course folders; a second click does not download again', async ({
  context,
  mock,
  queue,
  downloadsDir,
}) => {
  const page = await context.newPage();
  await page.goto(COURSE);
  await expect(page.locator('#udbsync-root')).toBeAttached();

  await hoverAndResolve(page, mock, 2102);
  const before = await pluginfileGets(mock, 5101);
  // Alt+click: download only (no auto-open in the headless test browser).
  await page.locator('#module-2102 a.aalink').click({ modifiers: ['Alt'] });

  const expected = join(downloadsDir, WEEK_DIR, 'Presentación Semana 12.pptx');
  await expect.poll(() => existsSync(expected), { timeout: 15_000 }).toBe(true);
  expect(statSync(expected).size).toBe(245_760);
  expect(page.url()).toBe(COURSE);
  await expect.poll(async () => (await queue()).tasks.map((t) => t.state)).toEqual(['hecha']);
  const toast = page.locator('#udbsync-root .udbsync-toast', { hasText: 'Guardado en' });
  await expect(toast).toContainText(`${WEEK_DIR}/Presentación Semana 12.pptx`);
  // "Abrir" / "Mostrar en carpeta" live in a framed extension page (ADR-016).
  const buttons = page.frameLocator('#udbsync-root iframe.udbsync-toast__frame');
  await expect(buttons.getByRole('button', { name: 'Abrir' })).toBeEnabled();
  await buttons.getByRole('button', { name: 'Mostrar en carpeta' }).click();
  await buttons.getByRole('button', { name: 'Abrir' }).click();
  await expect(buttons.locator('#status')).toHaveText('');

  const afterFirst = await pluginfileGets(mock, 5101);
  expect(afterFirst).toBe(before + 1);

  await page.locator('#module-2102 a.aalink').click({ modifiers: ['Alt'] });
  await expect(
    page.locator('#udbsync-root .udbsync-toast', { hasText: 'ya está descargado y al día' }),
  ).toBeVisible();
  expect(await pluginfileGets(mock, 5101)).toBe(afterFirst);
  expect(readdirSync(join(downloadsDir, WEEK_DIR))).toEqual(['Presentación Semana 12.pptx']);
  expect((await queue()).files).toHaveLength(1);
});

test('a changed file is "actualizado" and kept next to the old copy', async ({
  context,
  mock,
  queue,
  downloadsDir,
}) => {
  const page = await context.newPage();
  await page.goto(COURSE);
  await hoverAndResolve(page, mock, 2102);
  await page.locator('#module-2102 a.aalink').click({ modifiers: ['Alt'] });
  await expect.poll(async () => (await queue()).files.length, { timeout: 15_000 }).toBe(1);

  // New version on the server: the real site keeps revision 0, so size and date change.
  await mock.setResource(2102, { size: 250_000, lastModified: 'Tue, 22 Sep 2026 10:00:00 GMT' });
  await page.reload();
  await hoverAndResolve(page, mock, 2102);
  await page.locator('#module-2102 a.aalink').click({ modifiers: ['Alt'] });

  const updated = join(downloadsDir, WEEK_DIR, 'Presentación Semana 12 (rev 2).pptx');
  await expect.poll(() => existsSync(updated), { timeout: 15_000 }).toBe(true);
  expect(statSync(updated).size).toBe(250_000);
  expect(existsSync(join(downloadsDir, WEEK_DIR, 'Presentación Semana 12.pptx'))).toBe(true);
  const snapshot = await queue();
  expect(snapshot.tasks.map((t) => [t.reason, t.state])).toEqual([['actualizado', 'hecha']]);
  expect(snapshot.files[0]).toMatchObject({ versions: 2, fingerprint: { size: 250_000 } });
});

test('modified clicks keep the native behavior', async ({ context, mock, queue }) => {
  const page = await context.newPage();
  await page.goto(COURSE);
  await hoverAndResolve(page, mock, 2102);
  const popup = context.waitForEvent('page');
  await page.locator('#module-2102 a.aalink').click({ modifiers: ['ControlOrMeta'] });
  await (await popup).close();
  expect((await queue()).tasks).toHaveLength(0);
});

test('a badge above the cursor shows when a file is ready to save', async ({ context, mock }) => {
  const page = await context.newPage();
  await page.goto(COURSE);
  const badge = page.locator('#udbsync-root .udbsync-cursor-badge');
  await hoverAndResolve(page, mock, 2102);
  await expect(badge).toHaveAttribute('data-visible', 'true');
  await expect(badge).toHaveAttribute('data-state', 'ready');
  await expect(badge).toHaveText(/Clic para guardar/);
  // Another file (HEAD refused, GET fallback) is also ready.
  await hoverAndResolve(page, mock, 2104);
  await expect(badge).toHaveAttribute('data-state', 'ready');
  await page.mouse.move(0, 0);
  await expect(badge).toHaveAttribute('data-visible', 'false');
});
