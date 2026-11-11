import { expect, test } from 'playwright/test';

// The way into the 3D city is a button in the home hero (owner, 2026-11-11: «Где на сайте перейти
// в 3D мир? Не могу найти»): it is on screen on a phone and opens the walk.
test('the hero has a button into the 3D walk', async ({ page }, testInfo) => {
  await page.route('**/*', (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' });
    }
    if (/\/video\/.+\.(mp4|webm)$/.test(request.url()) || /mc\.yandex\.ru/.test(request.url())) {
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/?intro=0', { waitUntil: 'load' });
  const link = page.getByTestId('hero-walk');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/?walk=1');
  const box = (await link.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  if (testInfo.project.name === 'iphone-13') {
    const viewport = page.viewportSize()!;
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  }
  await link.click();
  await expect(page.getByRole('dialog', { name: 'Прогулка по 3D-городу' })).toBeVisible({
    timeout: 15_000,
  });
});
