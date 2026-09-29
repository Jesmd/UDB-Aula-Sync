import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, UDB } from './fixtures';
import { hoverAndResolve } from './helpers';

test('export writes a backup in UDB/_respaldo; import restores settings and index', async ({
  context,
  extensionId,
  mock,
  queue,
  downloadsDir,
}) => {
  const page = await context.newPage();
  await page.goto(`${UDB}/course/view.php?id=101&section=14`);
  await hoverAndResolve(page, mock, 2102);
  await page.locator('#module-2102 a.aalink').click({ modifiers: ['Alt'] });
  await expect.poll(async () => (await queue()).files.length, { timeout: 15_000 }).toBe(1);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/src/options/index.html`);
  await options.getByRole('button', { name: 'Exportar' }).click();
  await expect(options.getByTestId('backup-status')).toContainText('Guardada: 1 archivos');
  const folder = join(downloadsDir, 'UDB', '_respaldo');
  await expect
    .poll(() => readdirSync(folder, { withFileTypes: true }).length, {
      timeout: 10_000,
    })
    .toBe(1);
  const [name] = readdirSync(folder);
  const backup = JSON.parse(readFileSync(join(folder, name ?? ''), 'utf8')) as {
    format: string;
    files: { relativePath: string }[];
    settings: { updatePolicy: string };
  };
  expect(backup.format).toBe('udb-aula-sync-backup');
  expect(backup.files[0]?.relativePath).toContain('Presentación Semana 12.pptx');
  // Nothing from the session or the page ends up in the file.
  expect(JSON.stringify(backup)).not.toMatch(/sesskey|MoodleSession|<html/i);

  // Restore an edited copy.
  backup.settings.updatePolicy = 'omitir';
  const edited = join(downloadsDir, 'edited.json');
  writeFileSync(edited, JSON.stringify(backup));
  await options.getByLabel('Importar…').setInputFiles(edited);
  await expect(options.getByTestId('backup-status')).toContainText('Importado: 1 archivos');
  const stored = await options.evaluate(
    async () => (await chrome.storage.local.get('settings')).settings as { updatePolicy: string },
  );
  expect(stored.updatePolicy).toBe('omitir');
  expect((await queue()).files[0]?.downloadId).toBeNull();

  writeFileSync(edited, '{"format":"otra-cosa"}');
  await options.getByLabel('Importar…').setInputFiles(edited);
  await expect(options.getByTestId('backup-status')).toHaveText(
    'El archivo no es una copia de UDB Aula Sync válida.',
  );
});
