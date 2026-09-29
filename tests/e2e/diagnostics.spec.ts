import type { DiagnosticReport } from '../../src/moodle/diagnostic';
import { expect, test, UDB } from './fixtures';

/**
 * The popup asks the active tab's content script for a report. Here an extension page
 * plays the popup's part, since Playwright cannot open the real popup.
 */
test('content script returns a sanitized diagnostic report', async ({ context, extensionId }) => {
  const course = await context.newPage();
  await course.goto(`${UDB}/course/view.php?id=102&section=15`);
  await expect(course.locator('#udbsync-root')).toBeAttached();

  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/src/options/index.html`);
  const result = await ext.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://www.udbvirtual.edu.sv/auladigital/*' });
    if (tab?.id === undefined) return { ok: false, error: 'no tab' };
    return chrome.tabs.sendMessage<unknown, { ok: boolean; value?: DiagnosticReport }>(tab.id, {
      target: 'content',
      type: 'content/diagnose',
    });
  });

  expect(result.ok).toBe(true);
  const report = (result as { value: DiagnosticReport }).value;
  expect(report.detection.kind).toBe('onetopic');
  if ('error' in report.parsed) throw new Error(report.parsed.error.code);
  expect(report.parsed.course.shortName).toBe('DMD1042026C02G04LCS');
  expect(report.parsed.sections.filter((s) => !s.available)).toHaveLength(7);
  const json = JSON.stringify(report);
  for (const secret of ['Ana Pérez', 'ana.perez', 'AbCdEf1234', '4242'])
    expect(json).not.toContain(secret);
});

test('Chromium parses every layout fixture like jsdom does', async ({ context, extensionId }) => {
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/src/options/index.html`);
  for (const [id, layout, sections] of [
    [101, 'onetopic', 21],
    [102, 'onetopic', 22],
    [103, 'topics', 13],
    [104, 'weeks', 4],
    [105, 'generic', 2],
  ] as const) {
    const course = await context.newPage();
    await course.goto(`${UDB}/course/view.php?id=${id}`);
    await expect(course.locator('#udbsync-root')).toBeAttached();
    const report = await ext.evaluate(async (courseId) => {
      const [tab] = await chrome.tabs.query({
        url: `https://www.udbvirtual.edu.sv/auladigital/course/view.php?id=${courseId}`,
      });
      const response = await chrome.tabs.sendMessage<unknown, { value: DiagnosticReport }>(
        tab?.id ?? -1,
        { target: 'content', type: 'content/diagnose' },
      );
      return response.value;
    }, id);
    expect(report.detection.kind).toBe(layout);
    expect('sections' in report.parsed && report.parsed.sections.length).toBe(sections);
    await course.close();
  }
});
