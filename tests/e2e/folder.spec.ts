import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test, UDB } from './fixtures';
import { hoverAndResolve } from './helpers';

const COURSE = `${UDB}/course/view.php?id=101&section=14`;
const INNER = ['Estadística Aplicada ESA501 G01T', 'Desarrollo', 'Semana 12'];
const NAME = 'Presentación Semana 12.pptx';

/**
 * The native folder picker cannot be driven by Playwright. An origin-private folder (OPFS)
 * is a real FileSystemDirectoryHandle with read permission already granted, so it stands in
 * for "Descargas/UDB": saved where the options page would save the picked folder.
 */
async function chooseOpfsFolder(page: Page, size: number | null): Promise<void> {
  await page.evaluate(
    async ({ inner, name, size }) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('UDB', { recursive: true }).catch(() => undefined);
      let dir = await root.getDirectoryHandle('UDB', { create: true });
      const base = dir;
      for (const part of inner) dir = await dir.getDirectoryHandle(part, { create: true });
      if (size !== null) {
        const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await writable.write(new Uint8Array(size));
        await writable.close();
      }
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('udbsync');
        open.onsuccess = () => {
          resolve(open.result);
        };
        open.onerror = () => {
          reject(open.error ?? new Error('idb'));
        };
      });
      const tx = db.transaction(['handles', 'meta'], 'readwrite');
      tx.objectStore('handles').put(base, 'base');
      tx.objectStore('meta').put({ key: 'folder:info', value: { name: 'UDB', pickedAt: 1 } });
      await new Promise((resolve) => {
        tx.oncomplete = resolve;
      });
      db.close();
    },
    { inner: INNER, name: NAME, size },
  );
}

async function removeOpfsFile(page: Page): Promise<void> {
  await page.evaluate(
    async ({ inner, name }) => {
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('UDB');
      for (const part of inner) dir = await dir.getDirectoryHandle(part);
      await dir.removeEntry(name);
    },
    { inner: INNER, name: NAME },
  );
}

test('a file already in the chosen folder is adopted, not downloaded again', async ({
  context,
  extPage,
  mock,
  queue,
}) => {
  await chooseOpfsFolder(extPage, 245_760);
  const page = await context.newPage();
  await page.goto(COURSE);
  await hoverAndResolve(page, mock, 2102);
  await page.locator('#module-2102 a.aalink').click({ modifiers: ['Alt'] });
  await expect(
    page.locator('#udbsync-root .udbsync-toast', { hasText: 'ya estaba en tu carpeta' }),
  ).toBeVisible();
  const snapshot = await queue();
  expect(snapshot.tasks).toEqual([]);
  expect(snapshot.files).toMatchObject([{ cmid: 2102, downloadId: null }]);
  // Only the probe (HEAD or aborted GET) reached the file, never a full download.
  const gets = (await mock.requests()).filter((r) =>
    r.startsWith('GET /auladigital/pluginfile.php/5101/'),
  );
  expect(gets.length).toBeLessThanOrEqual(1);
});

test('Options > Carpeta checks the folder and finds deleted files', async ({
  context,
  extPage,
  extensionId,
  mock,
}) => {
  await chooseOpfsFolder(extPage, 245_760);
  const page = await context.newPage();
  await page.goto(COURSE);
  await hoverAndResolve(page, mock, 2102);
  await page.locator('#module-2102 a.aalink').click({ modifiers: ['Alt'] });
  await expect(
    page.locator('#udbsync-root .udbsync-toast', { hasText: 'ya estaba en tu carpeta' }),
  ).toBeVisible();

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/src/options/index.html`);
  await options.getByRole('tab', { name: 'Carpeta' }).click();
  await expect(options.getByTestId('folder-state')).toContainText('Carpeta: UDB.');
  await expect(options.getByTestId('folder-state')).toContainText('Con permiso de lectura.');
  await options.getByRole('button', { name: 'Comprobar ahora' }).click();
  const check = options.getByTestId('folder-check');
  await expect(check).toContainText('UDB: 1 archivos.');
  await expect(check).toContainText('Todos los archivos descargados siguen en su sitio.');
  const axe = await new AxeBuilder({ page: options })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await removeOpfsFile(extPage);
  await options.getByRole('button', { name: 'Comprobar ahora' }).click();
  await expect(check).toContainText('1 archivos descargados ya no están');
  await expect(check).toContainText(`${INNER.join('/')}/${NAME}`);
  await page.reload();
  await expect(page.locator('#udbsync-overlay .udbsync-pill[data-cmid="2102"]')).toHaveAttribute(
    'data-status',
    'perdido_local',
  );

  await options.getByRole('button', { name: 'Dejar de usar' }).click();
  await expect(options.getByRole('button', { name: 'Elegir carpeta' })).toBeVisible();
});
