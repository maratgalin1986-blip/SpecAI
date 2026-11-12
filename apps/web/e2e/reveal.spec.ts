import { expect, test } from 'playwright/test';

// A staggered block much taller than the screen must still appear: the catalogue grid on a
// phone (15 cards, ~6000 px) stayed invisible while Reveal waited for 15 % of the block to be
// on screen. A very short viewport makes the grid of /raboty that tall in proportion.
test('a staggered block taller than the screen still reveals', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 220 });
  await page.route(/\/video\/|mc\.yandex/, (route) => route.abort());
  await page.goto('/raboty', { waitUntil: 'load' });
  const block = page.locator('.reveal-stagger').first();
  await block.scrollIntoViewIfNeeded();
  const box = (await block.boundingBox())!;
  expect(box.height, 'the block is taller than 7 screens').toBeGreaterThan(220 * 7);
  await expect(block).toHaveClass(/reveal-visible/, { timeout: 5000 });
  await expect(block.locator(':scope > *').first()).toHaveCSS('opacity', '1', { timeout: 5000 });
});
