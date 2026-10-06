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

// A link to the order form (header «Заказать технику →», ad visitors) never
// opens the intro film over the form, and marks it seen for the session.
test('intro stays hidden on /#callback', async ({ page }) => {
  const errors = await guard(page);
  await page.goto('/#callback', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await expect(page.locator('#intro')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('sp16_intro_seen'))).toBe('1');
  expect(errors, 'page errors').toEqual([]);
});

// Only the phone and the consent are required: a lead without a name goes through.
test('callback form sends a lead without a name', async ({ page }) => {
  const errors = await guard(page);
  const sent: { body?: Record<string, unknown> } = {};
  await page.route('**/api/leads', (route) => {
    sent.body = route.request().postDataJSON();
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto('/?intro=0#callback', { waitUntil: 'load' });
  const form = page.locator('#callback form');
  await form.getByLabel('Телефон').fill('+7 927 000-00-00');
  await form.locator('input[name="consent"]').check();
  await form.getByRole('button', { name: 'Жду звонка' }).click();
  await expect(page.getByText(/Заявка у диспетчера/)).toBeVisible();
  expect(sent.body?.phone).toBe('+7 927 000-00-00');
  expect(errors, 'page errors').toEqual([]);
});

// The hero CTA lands on a usable form: within a second the phone field is on
// screen, not under the header, the cookie strip or the chat button, and takes focus.
test('hero CTA: phone field ready within 1 s', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-13', 'phone layout');
  const errors = await guard(page);
  await page.goto('/?intro=0', { waitUntil: 'load' });
  await page.locator('main a[href="#callback"]').first().click();
  const phone = page.locator('#callback').getByLabel('Телефон');
  await expect(phone).toBeInViewport({ timeout: 1000 });
  await expect(phone).toBeVisible();
  const free = await phone.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit === el && r.top > 64 && r.bottom < window.innerHeight) return 'free';
    return `${Math.round(r.top)}..${Math.round(r.bottom)} / ${window.innerHeight}: ${hit?.outerHTML.slice(0, 120)}`;
  });
  expect(free, 'the phone field is not covered').toBe('free');
  await phone.focus();
  await expect(phone).toBeFocused();
  // A repeat tap on the same hash still works (no hashchange).
  await page.mouse.wheel(0, -3000);
  await page.locator('main a[href="#callback"]').first().click();
  await expect(phone).toBeInViewport({ timeout: 1000 });
  expect(errors, 'page errors').toEqual([]);
});

// /stroyka is a full-screen layer: the consent strip must still be seen and
// tapped there (Metrika waits for it).
test('cookie strip visible and clickable on /stroyka', async ({ page }) => {
  const errors = await guard(page);
  await page.goto('/stroyka?nointro=1', { waitUntil: 'load' });
  const strip = page.getByTestId('cookie-strip');
  await expect(strip).toBeVisible({ timeout: 10_000 });
  await expect(strip).toBeInViewport();
  const agree = strip.getByRole('button', { name: 'Согласен' });
  const onTop = await agree.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });
  expect(onTop, 'nothing covers «Согласен»').toBe(true);
  const box = (await agree.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await agree.click();
  await expect(strip).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('cookie-consent'))).toBe('yes');
  expect(errors, 'page errors').toEqual([]);
});

// Phones: the main «Заказать технику» is on the first screen, above the bottom bar.
test('hero order button above the fold on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-13', 'phone layout');
  await guard(page);
  for (const size of [
    { width: 360, height: 740 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/?intro=0', { waitUntil: 'load' });
    const cta = page.locator('main a[href="#callback"]').first();
    const box = (await cta.boundingBox())!;
    const bar = (await page.getByRole('navigation', { name: 'Быстрая связь' }).boundingBox())!;
    expect(box.y + box.height, `${size.width}x${size.height}`).toBeLessThanOrEqual(bar.y);
  }
});

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
// the one order button («К заказу» in the top bar) stays on top of the film.
test('stroyka film tour', async ({ page }) => {
  const errors = await guard(page);
  await page.route('**/film/zones/*.mp4', (route) => route.abort());
  await page.goto('/stroyka?nointro=1', { waitUntil: 'load' });
  await expect(page.getByTestId('zone-film')).toBeVisible({ timeout: 15_000 });
  const strip = page.getByTestId('zone-strip');
  await expect(strip).toBeVisible();
  await strip.locator('button').nth(1).click();
  await page.waitForTimeout(800);
  await expect(page.getByTestId('skip-to-order')).toBeVisible();
  await page.getByTestId('skip-to-order').click();
  await expect(page.getByTestId('order-panel')).toBeVisible();
  expect(errors, 'page errors').toEqual([]);
});

// The personal film: a chapter card that never takes a click, and the offer to
// remember the visitor that stores nothing personal until «Да».
test('stroyka chapter card and memory offer', async ({ page }) => {
  const errors = await guard(page);
  await page.route('**/film/zones/*.mp4', (route) => route.abort());
  await page.goto('/stroyka?nointro=1', { waitUntil: 'load' });
  await expect(page.getByTestId('zone-film')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('zone-strip').locator('button').nth(1).click();
  const card = page.getByTestId('chapter-card');
  await expect(card).toContainText('Котлован');
  expect(await card.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  await expect(page.getByTestId('memory-consent')).toBeVisible({ timeout: 8_000 });
  await expect(card).toHaveCount(0);
  const stored = () => page.evaluate(() => localStorage.getItem('stroyka.memory.v1') ?? '');
  expect(await stored()).not.toContain('consent');
  await page.getByTestId('memory-no').click();
  await expect(page.getByTestId('memory-consent')).toHaveCount(0);
  expect(await stored()).toContain('declinedAt');
  expect(errors, 'page errors').toEqual([]);
});

// The story goes on after the visitor engaged, and the amber order button
// opens Света's form right in the film (no other page).
test('stroyka order stays in the film', async ({ page }) => {
  const errors = await guard(page);
  await page.route('**/film/zones/*.mp4', (route) => route.abort());
  await page.goto('/stroyka?nointro=1', { waitUntil: 'load' });
  await expect(page.getByTestId('dialogue')).toBeVisible({ timeout: 15_000 });
  // Phones show a subtitle bar: the replies are behind «Ответить».
  const expand = async () => {
    const button = page.getByTestId('dialogue-expand');
    if (await button.isVisible()) await button.click();
  };
  await expand();
  await page.getByRole('button', { name: 'Копать котлован или траншею' }).click();
  await page.getByTestId('zone-strip').getByRole('tab', { name: 'Котлован', exact: true }).click();
  await expect(page.getByTestId('dialogue')).toContainText('Ринат');
  await expand();
  await page.getByTestId('replies').getByRole('button', { name: 'Оформить у Светы' }).click();
  await expect(page.getByTestId('dialogue').locator('input[name="phone"]')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/stroyka');
  expect(errors, 'page errors').toEqual([]);
});

// The visitor leads in 3D: the camera never moves by itself, and «Куда идём?»
// flies to the chosen place (owner, 2026-10-03: «сам выбирал, куда идти»).
test('stroyka chooser', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one run is enough');
  // Software WebGL renders about a frame a second: React updates come late.
  test.setTimeout(300_000);
  const errors = await guard(page);
  await page.goto('/stroyka?nointro=1&3d=1', { waitUntil: 'load' });
  const ready = await page
    .waitForFunction(() => Boolean((window as { __stroyka?: unknown }).__stroyka), null, {
      timeout: 45_000,
    })
    .then(() => true)
    .catch(() => false);
  test.skip(!ready, 'no WebGL in this browser');
  type W = { __stroyka: { state: () => { camera: number[]; intro: boolean } } };
  await page.waitForFunction(() => !(window as unknown as W).__stroyka.state().intro);
  // The blend out of the opening shot, then the camera must stay put.
  await page.waitForTimeout(2500);
  const camera = () => page.evaluate(() => (window as unknown as W).__stroyka.state().camera);
  const before = await camera();
  await page.waitForTimeout(3000);
  expect(await camera(), 'no surprise moves').toEqual(before);
  // Clicks go in through the page (dispatchEvent): software rendering holds
  // real input events back for a long time.
  await page.evaluate(() =>
    (window as unknown as { __stroyka: { fx: (on: boolean) => void } }).__stroyka.fx(false),
  );
  await page.getByTestId('nav-open').dispatchEvent('click');
  await expect(page.getByTestId('nav-chooser')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('nav-person-npc-office')).toBeAttached();
  await page.getByTestId('nav-zone-sklad').dispatchEvent('click');
  await expect(page.getByTestId('zone-title')).toHaveText(/Склад/, { timeout: 150_000 });
  await expect(page.getByTestId('order-btn')).toBeAttached();
  expect(errors, 'page errors').toEqual([]);
});
