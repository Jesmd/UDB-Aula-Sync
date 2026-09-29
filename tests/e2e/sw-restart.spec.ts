import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, UDB } from './fixtures';
import { hoverAndResolve } from './helpers';

const WEEK_DIR = 'UDB/Estadística Aplicada ESA501 G01T/Desarrollo/Semana 12';

test('a worker restart in the middle of the queue resumes it', async ({
  context,
  mock,
  queue,
  extPage,
  downloadsDir,
}) => {
  test.setTimeout(60_000);
  // Slow files: 2 downloading (the limit) and 1 waiting when the worker dies.
  for (const cmid of [2102, 2103, 2104]) await mock.setResource(cmid, { throttleMs: 3_000 });

  const page = await context.newPage();
  await page.goto(`${UDB}/course/view.php?id=101&section=14`);
  for (const cmid of [2102, 2103, 2104]) await hoverAndResolve(page, mock, cmid);
  for (const cmid of [2102, 2103, 2104])
    await page.locator(`#module-${cmid} a.aalink`).click({ modifiers: ['Alt'] });

  await expect
    .poll(async () => (await queue()).tasks.map((t) => t.state).sort())
    .toEqual(['descargando', 'descargando', 'en_cola']);

  const logs = async () =>
    (
      await extPage.evaluate(() =>
        chrome.runtime.sendMessage<unknown, { value: { text: string } }>({
          target: 'background',
          type: 'logs/export',
        }),
      )
    ).value.text;
  const cdp = await context.newCDPSession(extPage);
  const { targetInfos } = (await cdp.send('Target.getTargets')) as {
    targetInfos: { type: string; targetId: string }[];
  };
  const worker = targetInfos.find((t) => t.type === 'service_worker');
  await cdp.send('Target.closeTarget', { targetId: worker?.targetId ?? '' });

  // The next message wakes a fresh worker. The log kept the first one's entries (ADR-029):
  // two starts, one install.
  const count = (text: string, word: string) => text.split(word).length - 1;
  await expect.poll(async () => count(await logs(), 'worker started')).toBe(2);
  expect(count(await logs(), 'installed')).toBe(1);

  await expect
    .poll(async () => (await queue()).tasks.map((t) => t.state), { timeout: 30_000 })
    .toEqual(['hecha', 'hecha', 'hecha']);
  const files = readdirSync(join(downloadsDir, WEEK_DIR)).sort();
  expect(files).toEqual([
    'Guía de ejercicios - Teorema del límite central.pdf',
    'Presentación Semana 12.pptx',
    'Tabla t-student.pdf',
  ]);
  expect(existsSync(join(downloadsDir, WEEK_DIR, 'Presentación Semana 12 (1).pptx'))).toBe(false);
  expect((await queue()).files).toHaveLength(3);
});
