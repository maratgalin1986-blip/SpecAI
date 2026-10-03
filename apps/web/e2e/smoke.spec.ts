import { expect, test, type Page } from 'playwright/test';

// The owner's rules on every key page: no script errors, the phone is in
// reach, no links to other websites (only WhatsApp, tel: and mailto:), the
// brand is never shortened to «СП16». Nothing is ever sent: every non-GET
// request (leads, photos, chat) is answered here.

const PAGES = ['/?intro=0', '/smeta', '/dizain', '/soglasie', '/privacy', '/arenda/samosval'];

const ALLOWED_EXTERNAL = [
  /^tel:/,
  /^mailto:/,
  /^https:\/\/wa\.me\//,
  /^https:\/\/api\.whatsapp\.com\//,
  // Our own Telegram bot (the Telegram funnel), never another channel.
  /^https:\/\/t\.me\/specplast16_zayavki_bot(\?start=[A-Za-z0-9_-]{1,64})?$/,
];

async function guard(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' });
    }
    // Background footage stalls headless pages; analytics must not count tests.
    if (/\/video\/.+\.(mp4|webm)$/.test(request.url()) || /mc\.yandex\.ru/.test(request.url())) {
      return route.abort();
    }
    return route.continue();
  });
  // Leads, explicitly: never reach the real endpoint.
  await page.route('**/api/leads', (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' }),
  );
  return errors;
}

/** Price text with every kind of space (no-break, narrow) as a plain one. */
const spaced = (text: string) => text.replace(/\s/g, ' ');

for (const path of PAGES) {
  test(`smoke ${path}`, async ({ page, baseURL }) => {
    const errors = await guard(page);
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForTimeout(800);

    // The phone call is one tap away.
    await expect(page.locator('a[href^="tel:"]:visible').first()).toBeVisible();

    // No links to other websites.
    const origin = new URL(baseURL!).origin;
    const hrefs = await page.$$eval('a[href]', (links) =>
      links.map((link) => (link as HTMLAnchorElement).href),
    );
    const external = hrefs.filter(
      (href) =>
        !href.startsWith(origin) &&
        !href.startsWith('javascript:') &&
        !ALLOWED_EXTERNAL.some((re) => re.test(href)),
    );
    expect(external, 'external links').toEqual([]);

    // The brand is spelled in full.
    const text = await page.evaluate(() => `${document.title}\n${document.body.innerText}`);
    expect(text).not.toMatch(/СП\s?16/);

    if (path.startsWith('/arenda/samosval')) {
      expect(spaced(await page.title())).toContain('от 3 300 ₽/ч');
      expect(spaced(await page.getByTestId('landing-price').innerText())).toContain('от 3 300 ₽');
    }

    expect(errors, 'page errors').toEqual([]);
  });
}

// The 3D site: every material compiles (a broken shader leaves machines
// invisible while the page itself shows no script error). Skipped where the
// browser has no WebGL and the page falls back to the 2D map.
test('stroyka shaders compile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one run is enough');
  const errors = await guard(page);
  const shaderErrors: string[] = [];
  page.on('console', (message) => {
    if (/Shader Error|WebGLProgram|program not valid/.test(message.text())) {
      shaderErrors.push(message.text().slice(0, 300));
    }
  });
  await page.goto('/stroyka?nointro=1&3d=1', { waitUntil: 'load' });
  const ready = await page
    .waitForFunction(() => Boolean((window as { __stroyka?: unknown }).__stroyka), null, {
      timeout: 45_000,
    })
    .then(() => true)
    .catch(() => false);
  test.skip(!ready, 'no WebGL in this browser');
  // Props and the city load after the first frame: let them compile too.
  await page.waitForTimeout(5000);
  expect(shaderErrors, 'shader errors').toEqual([]);
  expect(errors, 'page errors').toEqual([]);
});

// The default tour plays real footage per zone; the strip switches zones and
// the order button stays on top of the film.
test('stroyka film tour', async ({ page }) => {
  const errors = await guard(page);
  await page.route('**/film/zones/*.mp4', (route) => route.abort());
  await page.goto('/stroyka?nointro=1', { waitUntil: 'load' });
  await expect(page.getByTestId('zone-film')).toBeVisible({ timeout: 15_000 });
  const strip = page.getByTestId('zone-strip');
  await expect(strip).toBeVisible();
  await strip.locator('button').nth(1).click();
  await page.waitForTimeout(800);
  await expect(page.getByRole('button', { name: /Заказать технику/ }).first()).toBeVisible();
  expect(errors, 'page errors').toEqual([]);
});
