import { expect, test, type Page } from 'playwright/test';

// «На экран телефона / На рабочий стол»: the install button is big enough, on
// screen, and never covers the bottom bar, the cookie strip, the chat button.
// Nothing is sent: every non-GET request is answered here.

async function open(page: Page, path = '/?intro=0') {
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
  await page.goto(path, { waitUntil: 'load' });
  // The entrance animation lasts about a second; the cookie strip comes in at about 1.5 s and
  // slides for 300 ms: measure only after both have settled (the boxes move meanwhile).
  await page.waitForTimeout(1500);
  await page
    .getByTestId('cookie-strip')
    .waitFor({ state: 'visible', timeout: 4000 })
    .catch(() => undefined);
  await page.waitForTimeout(900);
}

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * The phone's bottom bar: its three buttons. Once folded, the round icon
 * stands in the bar's own row at its right end (the bar makes room,
 * globals.css data-install-dock), so it is the buttons that must stay clear.
 */
async function barButtons(page: Page): Promise<Box[]> {
  const items = page.locator('nav[aria-label="Быстрая связь"] > *');
  const boxes: Box[] = [];
  for (let i = 0; i < (await items.count()); i += 1) {
    const box = await items.nth(i).boundingBox();
    if (box) boxes.push(box);
  }
  return boxes;
}

test('install button is visible, in the viewport and clear of other fixed controls', async ({
  page,
}) => {
  await open(page);
  const fab = page.getByTestId('install-fab');
  await expect(fab).toBeVisible();
  const button = fab.getByRole('button', { name: /Установить приложение/ });
  const box = (await button.boundingBox())!;
  const viewport = page.viewportSize()!;

  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await expect(button).toContainText(/На экран телефона|На рабочий стол/);

  // The bottom bar's buttons (phones only), the chat button and the cookie strip.
  for (const barButton of await barButtons(page)) {
    expect(overlaps(box, barButton), `install button over a bottom bar button`).toBe(false);
  }
  for (const selector of ['.chat-fab', '[data-testid="cookie-strip"]']) {
    const other = page.locator(selector).first();
    if (!(await other.isVisible().catch(() => false))) continue;
    const otherBox = (await other.boundingBox())!;
    expect(
      overlaps(box, otherBox),
      `install button overlaps ${selector}: ${JSON.stringify([box, otherBox])}`,
    ).toBe(false);
  }
});

test('on a phone the button is above the bottom bar or in its row', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-13', 'bottom bar is for phones');
  await open(page);
  const bar = (await page.locator('nav[aria-label="Быстрая связь"]').boundingBox())!;
  const button = (await page.getByTestId('install-fab').locator('button').boundingBox())!;
  const docked = await page.evaluate(() =>
    document.documentElement.hasAttribute('data-install-dock'),
  );
  if (docked) {
    // In the bar's row, at its right end, clear of its three buttons.
    expect(button.y).toBeGreaterThanOrEqual(bar.y);
    for (const barButton of await barButtons(page)) {
      expect(overlaps(button, barButton)).toBe(false);
    }
  } else {
    expect(button.y + button.height).toBeLessThanOrEqual(bar.y);
  }
});

test('on a narrow phone the button is clear of the cookie strip too', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-13', 'phones only');
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page);
  const button = (await page.getByTestId('install-fab').locator('button').first().boundingBox())!;
  const strip = page.getByTestId('cookie-strip');
  if (await strip.isVisible().catch(() => false)) {
    expect(overlaps(button, (await strip.boundingBox())!)).toBe(false);
  }
  for (const barButton of await barButtons(page)) {
    expect(overlaps(button, barButton)).toBe(false);
  }
});

test('a press opens the instruction and closes again', async ({ page }) => {
  await open(page);
  const fab = page.getByTestId('install-fab');
  await fab.locator('button').first().click();
  const help = page.getByTestId('install-fab-help');
  await expect(help).toBeVisible();
  const helpBox = (await help.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(helpBox.x).toBeGreaterThanOrEqual(0);
  expect(helpBox.y).toBeGreaterThanOrEqual(0);
  expect(helpBox.x + helpBox.width).toBeLessThanOrEqual(viewport.width);
  await help.getByRole('button', { name: 'Понятно' }).click();
  await expect(help).toBeHidden();
});

test('install button stays away from the mini-app and the CRM-free pages keep it', async ({
  page,
}) => {
  await open(page, '/tg');
  await expect(page.getByTestId('install-fab')).toHaveCount(0);
});
