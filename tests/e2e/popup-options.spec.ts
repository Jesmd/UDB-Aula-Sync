import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test, UDB, type MockControl } from './fixtures';
import { hoverAndResolve } from './helpers';

const COURSE = `${UDB}/course/view.php?id=101&section=14`;
const WEEK_DIR = 'UDB/Estadística Aplicada ESA501 G01T/Desarrollo/Semana 12';

async function expectNoAxeViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  const results = await (include === undefined ? builder : builder.include(include)).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

/** Alt+click on 2102 and wait for the file at `folder` (relative to Downloads). */
async function downloadOne(page: Page, mock: MockControl, downloadsDir: string, folder: string) {
  await page.goto(COURSE);
  await hoverAndResolve(page, mock, 2102);
  await page.locator('#module-2102 a.aalink').click({ modifiers: ['Alt'] });
  const file = join(downloadsDir, folder, 'Presentación Semana 12.pptx');
  await expect.poll(() => existsSync(file), { timeout: 15_000 }).toBe(true);
}

test('popup shows the queue, the courses and finds downloaded files', async ({
  context,
  extensionId,
  mock,
  downloadsDir,
}) => {
  await downloadOne(await context.newPage(), mock, downloadsDir, WEEK_DIR);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);

  await expect(popup.getByTestId('queue-status')).toHaveText('No hay descargas pendientes.');
  await expect(popup.getByRole('button', { name: 'Pausar' })).toBeDisabled();
  await expect(popup.getByTestId('course-list')).toContainText(
    'Estadística Aplicada ESA501 G01T (Soyapango)',
  );
  await expect(popup.getByTestId('course-list')).toContainText('1 archivos');

  await popup
    .getByRole('searchbox', { name: 'Nombre, curso o carpeta' })
    .fill('semana 12 presentacion');
  const results = popup.getByTestId('search-results');
  await expect(results).toContainText('Presentación Semana 12.pptx');
  await expect(results).toContainText(WEEK_DIR);
  await results
    .getByRole('button', { name: 'Mostrar en carpeta: Presentación Semana 12.pptx' })
    .click();
  await expect(popup.locator('.status-error')).toHaveCount(0);

  await popup.getByRole('searchbox').fill('no-existe');
  await expect(popup.getByText('Sin resultados.')).toBeVisible();
  await expectNoAxeViolations(popup);
});

test('pausing holds the queue until "Reanudar"', async ({ context, extensionId, queue }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  // Nothing is queued: pause directly through the worker, as the panel's buttons do.
  await popup.evaluate(() =>
    chrome.runtime.sendMessage({ target: 'background', type: 'queue/control', action: 'pause' }),
  );
  await expect(popup.getByText('En pausa.')).toBeVisible();
  await popup.getByRole('button', { name: 'Reanudar' }).click();
  await expect(popup.getByRole('button', { name: 'Pausar' })).toBeVisible();
  expect((await queue()).paused).toBe(false);
});

test('options save valid values, reject invalid ones and preview the path', async ({
  context,
  extensionId,
  mock,
  downloadsDir,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options/index.html`);
  const stored = () =>
    page.evaluate(async () => (await chrome.storage.local.get('settings')).settings);

  await page.getByRole('radio', { name: /Tarjeta de detalles/ }).check();
  await expect(page.getByTestId('save-state')).toHaveText('Cambios guardados.');
  expect(await stored()).toMatchObject({ hoverDetails: 'tarjeta' });
  await expectNoAxeViolations(page);

  await page.getByRole('tab', { name: 'Rutas' }).click();
  const preview = page.getByTestId('path-preview');
  await expect(preview).toHaveText(
    'UDB/Estadística Aplicada ESA501 G01T/Unidad 01/Semana 03/Guía de ejercicios.pdf',
  );
  const template = page.getByRole('textbox', { name: 'Plantilla de ruta' });
  await template.fill('{base}/{curso}/{archivo');
  await template.blur();
  await expect(page.getByRole('alert')).toContainText('Plantilla no válida');
  await expect(template).toHaveAttribute('aria-invalid', 'true');
  expect(await stored()).toMatchObject({
    paths: { template: '{base}/{curso}/{padre}/{seccion}/{archivo}' },
  });
  await template.fill('{base}/{cursoCorto}/{seccion}/{archivo}');
  await template.blur();
  await expect(preview).toHaveText('UDB/ESA501 G01T/Semana 03/Guía de ejercicios.pdf');
  await page.getByRole('checkbox', { name: 'Agrupar por ciclo' }).check();
  await expect(preview).toHaveText('UDB/2026-C02/ESA501 G01T/Semana 03/Guía de ejercicios.pdf');
  await expectNoAxeViolations(page);

  for (const tab of ['Nombres', 'Sincronización', 'Seguridad']) {
    await page.getByRole('tab', { name: tab }).click();
    await expectNoAxeViolations(page);
  }

  // Per-course settings list courses the extension has seen (the new template applies).
  await downloadOne(
    await context.newPage(),
    mock,
    downloadsDir,
    'UDB/2026-C02/ESA501 G01T/Semana 12',
  );
  await page.reload();
  await page.getByRole('tab', { name: 'Cursos' }).click();
  const course = page.getByTestId('course-101');
  await course.locator('summary').click();
  const skip = course.getByRole('textbox', { name: 'Pestañas o secciones que no se descargan' });
  await skip.fill('Recursos Bibliográficos\n\nFeedback');
  await skip.blur();
  await expect(course.locator('summary')).toContainText('personalizado');
  expect(await stored()).toMatchObject({
    courses: { 101: { skipSections: ['Recursos Bibliográficos', 'Feedback'] } },
  });
  await expectNoAxeViolations(page);
});
