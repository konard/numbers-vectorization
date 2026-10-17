// Playwright MCP snippet (browser_run_code_unsafe filename): draws a barred 7
// in the app's Draw mode at http://localhost:4173 and reports what the app
// shows (issue 7: pen recording and automatic settings on pencil input).
async (page) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto('http://localhost:4173/');
  await page.getByRole('radio', { name: 'Draw' }).click();
  const canvas = page.locator('.drawing-canvas');
  const box = await canvas.boundingBox();
  const scale = box.width / 280;
  const at = (x, y) => [box.x + x * scale, box.y + y * scale];
  const stroke = async (points) => {
    await page.mouse.move(...at(...points[0]));
    await page.mouse.down();
    for (const point of points.slice(1)) {
      await page.mouse.move(...at(...point), { steps: 8 });
    }
    await page.mouse.up();
  };
  await stroke([
    [70, 60],
    [210, 60],
    [120, 230],
  ]);
  await stroke([
    [110, 145],
    [200, 145],
  ]);
  await page.waitForTimeout(500);
  const text = await page.locator('main').innerText();
  return text
    .split('\n')
    .filter((line) =>
      /Recording:|Auto:|Strokes|strokes|points|Points|^\d/.test(line)
    )
    .slice(0, 40)
    .join('\n');
};
