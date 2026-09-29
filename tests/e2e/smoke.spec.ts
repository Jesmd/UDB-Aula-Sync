import { expect, test, UDB } from './fixtures';

test('injects the ready toast in Shadow DOM on the UDB host', async ({ context, worker }) => {
  expect(worker.url()).toMatch(/^chrome-extension:\/\//);
  const page = await context.newPage();
  await page.goto(`${UDB}/course/view.php?id=101`);

  const host = page.locator('#udbsync-root');
  await expect(host).toBeAttached();
  expect(await host.evaluate((el) => el.shadowRoot?.mode)).toBe('open');

  // Playwright locators pierce open shadow roots.
  const toast = page.locator('#udbsync-root .udbsync-toast');
  await expect(toast).toContainText('UDB Aula Sync está activo');
  await expect(page.locator('#udbsync-root .udbsync-toasts')).toHaveAttribute(
    'aria-live',
    'polite',
  );
});

test('does not inject outside /auladigital/', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://www.udbvirtual.edu.sv/__health');
  await page.waitForTimeout(500);
  await expect(page.locator('#udbsync-root')).toHaveCount(0);
});

test('popup reaches the background service', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  await expect(page.getByTestId('service-status')).toContainText('0.0.1');
});

test('offscreen document answers through the worker', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options/index.html`);
  await page.getByRole('tab', { name: 'Diagnóstico' }).click();
  await page.getByRole('button', { name: 'Probar documento offscreen' }).click();
  await expect(page.getByTestId('diag-output')).toContainText('DOMParser ok');
});

test('session probe runs from worker and offscreen (H3 wiring)', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options/index.html`);
  await page.getByRole('tab', { name: 'Diagnóstico' }).click();
  await page.getByRole('button', { name: 'Probar sesión en segundo plano (H3)' }).click();
  const output = page.getByTestId('diag-output');
  await expect(output).toContainText('"worker"');
  await expect(output).toContainText('"offscreen"');
  await expect(output).toContainText('/auladigital/my/');
  // The mock treats every client as logged in; the real check happens in Brave (MOODLE-NOTES).
  await expect(output).toContainText('"sessionSent": true');
});
