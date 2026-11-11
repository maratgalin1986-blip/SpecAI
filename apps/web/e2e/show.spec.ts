import { expect, test, type Page } from 'playwright/test';

// The «show» layer (app/show.css, components/ShowRuntime.tsx, lib/showGate.ts):
// the key pages render without script errors and without sideways scroll on a
// phone, the level is written on <html>, reduced motion switches it off, and
// the celebration after a sent заявка never blocks the next action. Nothing is
// ever sent: every non-GET request is answered here.

const PAGES = [
  '/?intro=0',
  '/arenda/samosval',
  '/map',
  '/orders',
  '/providers',
  '/ceny',
  '/raboty',
  '/contacts',
  '/equipment',
];

async function guard(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // A runner with two cores would count as a weak phone: pin a normal one.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
  });
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

for (const path of PAGES) {
  test(`show ${path}: no errors, no sideways scroll at 390 px`, async ({ page }) => {
    const errors = await guard(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    // The whole page, so every section's decor has been on screen once.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
    // The phone is never hidden by the show.
    await expect(page.locator('a[href^="tel:"]:visible').first()).toBeVisible();
    expect(await page.locator('html').getAttribute('data-show')).toBe('full');
    expect(errors, 'page errors').toEqual([]);
  });
}

test('reduced motion switches the show off', async ({ page }) => {
  const errors = await guard(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/providers', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  expect(await page.locator('html').getAttribute('data-show')).toBe('off');
  // Nothing hides while the show is off: the heading is fully opaque at once.
  const opacity = await page
    .locator('h1')
    .first()
    .evaluate((el) => getComputedStyle(el).opacity);
  expect(opacity).toBe('1');
  await expect(page.locator('.show-progress')).toHaveCount(0);
  expect(errors, 'page errors').toEqual([]);
});

test('data saver gives the calm version', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true, effectiveType: '4g' },
      configurable: true,
    });
  });
  const errors = await guard(page);
  await page.goto('/ceny', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  expect(await page.locator('html').getAttribute('data-show')).toBe('calm');
  expect(errors, 'page errors').toEqual([]);
});

test('pages that are not the platform get no show', async ({ page }) => {
  const errors = await guard(page);
  await page.goto('/privacy', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  expect(await page.locator('html').getAttribute('data-show')).toBeNull();
  await expect(page.locator('.show-progress')).toHaveCount(0);
  expect(errors, 'page errors').toEqual([]);
});

test('sent заявка: celebration, Ivan calls back, and the next action is not blocked', async ({
  page,
}) => {
  const errors = await guard(page);
  await page.goto('/?intro=0#callback', { waitUntil: 'load' });
  const form = page.locator('#callback form');
  await form.getByLabel('Телефон').fill('+7 927 000-00-00');
  await form.locator('input[name="consent"]').check();
  await form.getByRole('button', { name: 'Жду звонка' }).click();
  await expect(page.getByText(/Заявка у диспетчера/)).toBeVisible();
  await expect(page.getByText(/Иван перезвонит/)).toBeVisible();
  // Confetti is on screen, but it cannot take a tap.
  await expect(page.getByTestId('celebrate')).toBeAttached();
  const pointer = await page
    .getByTestId('celebrate')
    .evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(pointer).toBe('none');
  // The next action works at once: the phone button passes Playwright's hit-test.
  const call = page.getByRole('link', { name: /Позвонить сейчас/ });
  await call.click({ trial: true, timeout: 2000 });
  // And it removes itself.
  await expect(page.getByTestId('celebrate')).toHaveCount(0, { timeout: 5000 });
  expect(errors, 'page errors').toEqual([]);
});
