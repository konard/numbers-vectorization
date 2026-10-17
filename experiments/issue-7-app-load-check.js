// Playwright MCP snippet (browser_run_code_unsafe filename): in Draw mode,
// loads examples/recordings/seven-barred.lino, waits for the replay, saves
// the recording as JSON, switches "Max points per shape" to manual 1 and
// reports what the app shows (issue 7).
async (page) => {
  const root = '/tmp/gh-issue-solver-1792224189012';
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto('http://localhost:4173/');
  await page.getByRole('radio', { name: 'Draw' }).click();
  await page
    .locator('.file-button input[type=file]')
    .setInputFiles(`${root}/examples/recordings/seven-barred.lino`);
  await page.getByRole('button', { name: 'Replaying' }).waitFor();
  await page
    .getByRole('button', { name: 'Replay', exact: true })
    .first()
    .waitFor({ timeout: 15000 });
  const report = [];
  const summary = () =>
    page
      .locator('main')
      .innerText()
      .then((text) =>
        text
          .split('\n')
          .filter((line) =>
            /Recording:|Auto:|^Manual|^\d|Max points/.test(line)
          )
          .slice(0, 22)
          .join(' | ')
      );
  report.push(`loaded: ${await summary()}`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save JSON' }).click(),
  ]);
  const saved = `${root}/experiments/output/pen-recording.json`;
  await download.saveAs(saved);
  report.push(`saved ${download.suggestedFilename()}`);
  const control = page
    .locator('.range-control')
    .filter({ hasText: 'Max points per shape' });
  await control.getByRole('checkbox', { name: 'Auto' }).uncheck();
  await control.getByRole('slider').fill('1');
  await page.waitForTimeout(300);
  report.push(`max points 1: ${await summary()}`);
  return report.join('\n');
};
