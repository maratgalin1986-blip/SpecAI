import { expect, test, type Page } from 'playwright/test';

// «Прогуляться по городу» on the home page (owner, 2026-11-10): the invitation
// is visible, the walk opens and closes (exit button, Escape, browser Back) and
// the order link of a stop carries the machinery kind. Works with the live
// scene and with the poster fallback (no WebGL): the walk UI is the same.
// Nothing is ever sent: every non-GET request is answered here.

async function guard(page: Page) {
  const errors: string[] = [];
  // No WebGL: the walk runs over the poster, the same way it does on a weak phone.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (/webgl/i.test(type)) return null;
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  page.on('pageerror', (error) => errors.push(error.message));
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
  return errors;
}

async function openHome(page: Page, path = '/?intro=0') {
  await page.goto(path, { waitUntil: 'load' });
  await page.locator('#world3d-title').scrollIntoViewIfNeeded();
}

const invitation = (page: Page) =>
  page.getByRole('button', { name: 'Прогуляться по городу' }).first();
const exitButton = (page: Page) => page.getByRole('button', { name: 'Выйти из прогулки' });
const walkDialog = (page: Page) => page.getByRole('dialog', { name: 'Прогулка по 3D-городу' });

test('the invitation is visible and the walk opens and closes', async ({ page }) => {
  const errors = await guard(page);
  await openHome(page);
  await expect(invitation(page)).toBeVisible();

  await invitation(page).click();
  await expect(walkDialog(page)).toBeVisible();
  const exit = walkDialog(page).getByRole('button', { name: 'Выйти из прогулки' });
  await expect(exit).toBeVisible();
  await expect(walkDialog(page).getByText('Остановка 1 из 4')).toBeVisible();

  // The exit is inside the screen, and so is the price of the stop (from lib/prices.ts).
  const box = await exit.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  await expect(walkDialog(page).getByText(/₽\/ч\s+с\s+машинистом/)).toBeVisible();

  await exit.click();
  await expect(walkDialog(page)).toHaveCount(0);
  expect(errors, 'script errors').toEqual([]);
});

test('Escape and the browser Back button close the walk', async ({ page }) => {
  await guard(page);
  await openHome(page);
  await invitation(page).click();
  await expect(walkDialog(page)).toBeVisible();
  // The controls load a moment after the picture: wait for them before pressing keys.
  await expect(exitButton(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(walkDialog(page)).toHaveCount(0);

  await invitation(page).click();
  await expect(walkDialog(page)).toBeVisible();
  // The controls load a moment after the picture: wait for them before pressing keys.
  await expect(exitButton(page)).toBeVisible();
  await page.goBack();
  await expect(walkDialog(page)).toHaveCount(0);
  // Back closed the walk and stayed on the home page.
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(invitation(page)).toBeVisible();
});

test('the stops go round and the order link carries the machinery kind', async ({ page }) => {
  await guard(page);
  await openHome(page);
  await invitation(page).click();
  const dialog = walkDialog(page);
  await expect(dialog).toBeVisible();
  // Stop the tour from moving on by itself while the test reads the card.
  await dialog.getByRole('button', { name: /Пауза/ }).click();

  const titles: string[] = [];
  const hrefs: string[] = [];
  for (let i = 0; i < 4; i++) {
    await expect(dialog.getByText(`Остановка ${i + 1} из 4`)).toBeVisible();
    titles.push((await dialog.locator('p[aria-live]').innerText()).trim());
    hrefs.push((await dialog.getByRole('link', { name: 'Заказать' }).getAttribute('href')) ?? '');
    await expect(dialog.getByRole('link', { name: 'Позвонить' })).toHaveAttribute('href', /^tel:/);
    await dialog.getByRole('button', { name: /Дальше/ }).click();
  }
  expect(titles).toEqual(['Экскаватор-погрузчик', 'Автокран', 'Автовышка', 'Самосвал']);
  // Every stop orders its own kind: the form with the category when the catalogue
  // has it, the plain form otherwise (no database in the test build).
  for (const href of hrefs) expect(href).toMatch(/^\/orders(\?category=[\w-]+)?#new$/);
  if (hrefs.some((h) => h.includes('category='))) expect(new Set(hrefs).size).toBe(4);
  // Back at the first stop after the last one.
  await expect(dialog.getByText('Остановка 1 из 4')).toBeVisible();
  await dialog.getByRole('button', { name: /Назад/ }).click();
  await expect(dialog.getByText('Остановка 4 из 4')).toBeVisible();
});

test('/?walk=1 opens the walk straight away and leaves the address clean', async ({ page }) => {
  await guard(page);
  await page.goto('/?intro=0&walk=1', { waitUntil: 'load' });
  await expect(walkDialog(page)).toBeVisible();
  await expect.poll(() => page.url()).not.toContain('walk=1');
  await page.getByRole('button', { name: 'Выйти из прогулки' }).click();
  await expect(walkDialog(page)).toHaveCount(0);
});
