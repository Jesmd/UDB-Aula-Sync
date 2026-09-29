import AxeBuilder from '@axe-core/playwright';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test, UDB } from './fixtures';

// Course 103 (topics layout): the whole course is on one page, so no tab requests.
const COURSE = `${UDB}/course/view.php?id=103`;
const COURSE_DIR = 'UDB/Introducción a Redes IRD101 G02T';

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.push(relative(dir, path).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

async function openPanel(page: Page) {
  await page.goto(COURSE);
  const root = page.locator('#udbsync-root');
  await root.getByRole('button', { name: /Descargas del curso/ }).click();
  const panel = root.getByRole('region', { name: 'UDB Aula Sync' });
  await expect(panel).toBeVisible();
  return panel;
}

test('"Descargar todo" downloads the course into its folders; "Solo nuevos" then finds nothing', async ({
  context,
  mock,
  queue,
  downloadsDir,
}) => {
  const page = await context.newPage();
  const panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Descargar todo el curso' }).click();

  // 6 files, well under the confirmation threshold: starts without asking. "Examen
  // resuelto" is restricted (not available) and Tema 12 is hidden.
  await expect(panel.getByRole('table')).toContainText('Nuevos6');
  await expect(panel.getByRole('table')).toContainText('Solo lectura1');
  await expect(panel.getByRole('status')).toContainText('Listo: 6 descargados, 0 con error.', {
    timeout: 30_000,
  });
  await expect.poll(async () => (await queue()).files.length).toBe(6);

  const files = listFiles(join(downloadsDir, COURSE_DIR));
  expect(files).toHaveLength(6);
  expect(files).toContain('Tema 02/Archivos Packet Tracer/Resueltos/lab1-resuelto.pkt');
  expect(files).toContain('Tema 02/Archivos Packet Tracer/lab1.pkt');
  expect(files.some((f) => f.startsWith('Tema 01/Presentación Tema 1'))).toBe(true);
  expect(files.some((f) => f.startsWith('Tema 03/'))).toBe(false);

  // Status pills on the page (overlay host, no layout shift).
  const overlay = page.locator('#udbsync-overlay');
  await expect(overlay.locator('.udbsync-pill[data-cmid="4102"]')).toHaveAttribute(
    'data-status',
    'descargado',
  );
  await expect(overlay.locator('.udbsync-pill[data-cmid="4301"]')).toHaveAttribute(
    'data-status',
    'solo_lectura',
  );

  // WCAG 2.1 AA on the extension's own UI (the page itself is Moodle's).
  const axe = await new AxeBuilder({ page })
    .include('#udbsync-root')
    .include('#udbsync-overlay')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  expect(axe.passes.length).toBeGreaterThan(0);

  // Never more than 2 requests at once (spec §2).
  expect(await mock.maxInFlight()).toBeLessThanOrEqual(2);

  await panel.getByRole('button', { name: 'Solo nuevos' }).click();
  await expect(panel).toContainText('No hay nada que descargar: todo está al día.');
  expect(listFiles(join(downloadsDir, COURSE_DIR))).toHaveLength(6);
});

test('after a change on the server only the changed file downloads again', async ({
  context,
  mock,
  queue,
  downloadsDir,
}) => {
  const page = await context.newPage();
  let panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Descargar todo el curso' }).click();
  await expect(panel.getByRole('status')).toContainText('Listo: 6 descargados', {
    timeout: 30_000,
  });

  await mock.setResource(4102, { size: 61_000, lastModified: 'Tue, 22 Sep 2026 10:00:00 GMT' });
  panel = await openPanel(page);
  // "Solo nuevos" ignores updates…
  await panel.getByRole('button', { name: 'Solo nuevos' }).click();
  await expect(panel).toContainText('No hay nada que descargar');
  // …"Descargar todo" brings the new version, next to the old copy.
  await panel.getByRole('button', { name: 'Descargar todo el curso' }).click();
  await expect(panel.getByRole('table')).toContainText('Actualizados1');
  await expect(panel.getByRole('status')).toContainText('Listo: 1 descargados', {
    timeout: 30_000,
  });
  const updated = join(downloadsDir, COURSE_DIR, 'Tema 01', 'Presentación Tema 1 (rev 2).pptx');
  await expect.poll(() => statSync(updated, { throwIfNoEntry: false })?.size).toBe(61_000);
  expect((await queue()).tasks.filter((t) => t.reason === 'actualizado')).toHaveLength(1);
});

test('a lost session stops the scan before any download', async ({ context, mock, queue }) => {
  const page = await context.newPage();
  const panel = await openPanel(page);
  await mock.setSession(false);
  await panel.getByRole('button', { name: 'Descargar todo el curso' }).click();
  await expect(panel.getByRole('status')).toContainText('Tu sesión del Aula Digital caducó');
  expect((await queue()).tasks).toEqual([]);
  const pluginfile = (await mock.requests()).filter((r) => /pluginfile\.php\/\d+\/mod_/.test(r));
  expect(pluginfile).toEqual([]);
});
