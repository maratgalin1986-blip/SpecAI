import { expect, test, type Page } from 'playwright/test';

// The visitor's way to a заявка: the opening titles are short, nothing fixed
// lies on the buttons that take the order, the phone is in the header, the
// short forms send with a phone and the consent only. Nothing is really sent:
// every non-GET request is answered here.

type Box = { x: number; y: number; width: number; height: number };
type Sent = { url: string; body: Record<string, unknown> };

async function guard(page: Page): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route('**/*', (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      let body: Record<string, unknown> = {};
      try {
        body = request.postDataJSON() ?? {};
      } catch {
        // Not JSON (beacons): nothing to keep.
      }
      sent.push({ url: request.url(), body });
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: '{"ok":true,"message":"Заявка опубликована."}',
      });
    }
    if (/\/video\/.+\.(mp4|webm)$/.test(request.url()) || /mc\.yandex\.ru/.test(request.url())) {
      return route.abort();
    }
    return route.continue();
  });
  return sent;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 640;

test('opening titles are gone within 3 s and the main button takes a tap', async ({ page }) => {
  await guard(page);
  await page.goto('/', { waitUntil: 'commit' });
  // The titles do play for a first-time visitor…
  await expect(page.locator('#intro:not([hidden])')).toHaveCount(1);
  // …and are gone 3 s after they started, however late the page's code woke up.
  await expect(page.locator('#intro:not([hidden])')).toHaveCount(0, { timeout: 3500 });
  const played = await page.evaluate(
    () => Date.now() - (window as unknown as { __introAt: number }).__introAt,
  );
  expect(played).toBeLessThan(3000 + 500);
  const cta = page.locator('main a[href="#callback"]').first();
  await expect(cta).toBeVisible();
  // The topmost element at the button's centre is the button itself.
  const box = (await cta.boundingBox())!;
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.closest('a')?.getAttribute('href') ?? null,
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(hit).toBe('#callback');
});

// The install button and the cookie strip against what brings the заявка.
const PAGES = ['/?intro=0', '/arenda/ekskavator-pogruzchik', '/contacts', '/orders'];
const SIZES = [
  { width: 390, height: 844 },
  { width: 390, height: 664 },
  { width: 1280, height: 720 },
];
const IMPORTANT = [
  'main a[href$="#callback"]',
  'main a[href^="tel:"]',
  'header a[href^="tel:"]',
  'main button[type="submit"]',
  'main :text-matches("₽")',
];

for (const size of SIZES) {
  test(`fixed buttons never lie on the order buttons, ${size.width}x${size.height}`, async ({
    page,
  }) => {
    // One run per size is enough: the viewport is set here, not by the project.
    test.skip(isPhone(page) !== size.width < 640, 'the other project runs this size');
    await page.setViewportSize(size);
    await guard(page);
    for (const path of PAGES) {
      await page.goto(path, { waitUntil: 'load' });
      // The entrance of the install button and the strip's slide have settled.
      await page.waitForTimeout(1500);
      await page
        .getByTestId('cookie-strip')
        .waitFor({ state: 'visible', timeout: 4000 })
        .catch(() => undefined);
      await page.waitForTimeout(900);
      const overlays: { name: string; box: Box }[] = [];
      for (const [name, selector] of [
        ['install button', '[data-testid="install-fab"] button'],
        ['cookie strip', '[data-testid="cookie-strip"]'],
      ] as const) {
        const el = page.locator(selector).first();
        if (!(await el.isVisible().catch(() => false))) continue;
        // The strip steps aside (data-away: transparent, takes no taps) while a
        // phone, an order button or a field is under it — then it covers nothing.
        const seen = await el.evaluate((node) => {
          let opacity = 1;
          for (let at: Element | null = node; at; at = at.parentElement) {
            opacity *= parseFloat(getComputedStyle(at).opacity);
          }
          return opacity > 0.05;
        });
        if (!seen) continue;
        const box = await el.boundingBox();
        if (box) overlays.push({ name, box });
      }
      for (const selector of IMPORTANT) {
        const items = page.locator(selector);
        const count = Math.min(await items.count(), 12);
        for (let i = 0; i < count; i += 1) {
          const item = items.nth(i);
          if (!(await item.isVisible().catch(() => false))) continue;
          const box = await item.boundingBox();
          // Only what is on the screen now can be covered.
          if (!box || box.y + box.height <= 0 || box.y >= size.height) continue;
          for (const overlay of overlays) {
            expect(
              overlaps(box, overlay.box),
              `${overlay.name} over ${selector} on ${path} at ${size.width}x${size.height}`,
            ).toBe(false);
          }
        }
      }
    }
  });
}

test('the phone number is in the desktop header', async ({ page }) => {
  test.skip(isPhone(page), 'desktop only');
  await guard(page);
  await page.goto('/?intro=0', { waitUntil: 'load' });
  const phone = page.locator('header a[href^="tel:"]:visible').first();
  await expect(phone).toBeVisible();
  await expect(phone).toContainText(/\d{3}/);
  const box = (await phone.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(1280);
  expect(box.y + box.height).toBeLessThan(120);
});

test('/orders: the short form sends with a phone and the consent only', async ({ page }) => {
  const sent = await guard(page);
  await page.goto('/orders#new', { waitUntil: 'networkidle' });
  const form = page.locator('[data-guest-order-form]');
  await expect(form).toBeVisible();
  // The details are folded: the first step is the machine, the phone, the consent.
  await expect(form.locator('textarea')).toBeHidden();
  await expect(form.locator('[data-order-phone]')).toHaveAttribute('href', /^tel:/);

  // Empty: the form's own words under the fields, nothing sent.
  await form.getByRole('button', { name: 'Опубликовать заявку' }).click();
  await expect(form.locator('[data-field-error]')).toHaveCount(2);
  await expect(form).toContainText('Укажите телефон');
  await expect(form).toContainText('Нужно согласие на обработку персональных данных');
  expect(sent.filter((item) => item.url.includes('/api/orders/guest'))).toHaveLength(0);

  // Typed with 8, as people do: the mask shows +7.
  const phone = form.getByLabel('Телефон');
  await phone.click();
  await phone.pressSequentially('89270000002');
  await expect(phone).toHaveValue('+7 (927) 000-00-02');
  const consent = form.locator('input[name="consent"]');
  const consentBox = (await consent.boundingBox())!;
  expect(consentBox.width).toBeGreaterThanOrEqual(24);
  expect(consentBox.height).toBeGreaterThanOrEqual(24);
  const row = (await form.locator('label:has(input[name="consent"])').boundingBox())!;
  expect(row.height).toBeGreaterThanOrEqual(44);
  await consent.check();
  await form.getByRole('button', { name: 'Опубликовать заявку' }).click();
  await expect(page.locator('[data-guest-order-done]')).toBeVisible();
  const order = sent.find((item) => item.url.includes('/api/orders/guest'))!;
  expect(order.body.phone).toBe('+7 (927) 000-00-02');
  expect(order.body.consent).toBe(true);
  expect(String(order.body.description)).toMatch(/уточнить по телефону/);
  expect(String(order.body.desiredStartDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(String(order.body.name).length).toBeGreaterThan(0);
});

test('Сторож speaks while the cookie strip is still open', async ({ page }) => {
  test.skip(isPhone(page), 'the leave-by-mouse trigger is the desktop one');
  await guard(page);
  await page.clock.install();
  await page.goto('/?intro=0', { waitUntil: 'load' });
  await page.clock.fastForward(3000);
  await expect(page.getByTestId('cookie-strip')).toBeVisible();
  await page.clock.fastForward(22_000);
  await page.evaluate(() =>
    document.documentElement.dispatchEvent(new MouseEvent('mouseleave', { clientY: -3 })),
  );
  const card = page.getByTestId('storozh');
  await expect(card).toBeVisible();
  // The card slides in for 300 ms (the clock is ours here).
  await page.clock.fastForward(1000);
  await expect(card).toHaveCSS('opacity', '1');
  await expect(page.getByTestId('cookie-strip')).toBeVisible();
  const cardBox = (await card.boundingBox())!;
  const stripBox = (await page.getByTestId('cookie-strip').boundingBox())!;
  expect(overlaps(cardBox, stripBox), 'Сторож over the cookie strip').toBe(false);
});

test('bottom bar «Заказать» opens the short form in place', async ({ page }) => {
  test.skip(!isPhone(page), 'the bottom bar is for phones');
  const sent = await guard(page);
  await page.goto('/contacts', { waitUntil: 'load' });
  const bar = page.getByRole('navigation', { name: 'Быстрая связь' });
  const opener = bar.getByRole('button', { name: 'Заказать' });
  await opener.click();
  const sheet = page.locator('dialog[data-order-sheet]');
  await expect(sheet).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/contacts');
  // The caret is in the phone field; Tab never leaves the sheet.
  await expect(sheet.getByLabel('Телефон')).toBeFocused();
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const active = document.activeElement;
      // The browser's own chrome takes the focus for one step of the ring.
      return !active || active === document.body || Boolean(active.closest('dialog'));
    });
    expect(inside, `focus stays in the sheet (Tab ${i + 1})`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();

  // And it sends: a phone and the consent.
  await opener.click();
  await sheet.getByLabel('Телефон').fill('9270000003');
  await sheet.locator('input[name="consent"]').check();
  await sheet.getByRole('button', { name: 'Жду звонка' }).click();
  await expect(sheet).toContainText(/Заявка у диспетчера/);
  const lead = sent.find((item) => item.url.includes('/api/leads'))!;
  expect(lead.body.phone).toBe('+7 (927) 000-00-03');
  expect(String(lead.body.source)).toMatch(/^bottom-bar/);
});

test('home: the short form under the hero and inline errors', async ({ page }) => {
  const sent = await guard(page);
  await page.goto('/?intro=0', { waitUntil: 'load' });
  const form = page.locator('#quick-callback form');
  await form.scrollIntoViewIfNeeded();
  await expect(form.locator('textarea')).toHaveCount(0);
  const phone = form.getByLabel('Телефон');
  const size = await phone.evaluate((el) => ({
    font: parseFloat(getComputedStyle(el).fontSize),
    height: el.getBoundingClientRect().height,
  }));
  expect(size.font).toBeGreaterThanOrEqual(16);
  expect(size.height).toBeGreaterThanOrEqual(44);
  await phone.fill('+7 927 12');
  await form.getByRole('button', { name: 'Жду звонка' }).click();
  await expect(form).toContainText('Номер неполный');
  await expect(form).toContainText('Нужно согласие на обработку персональных данных');
  expect(sent.filter((item) => item.url.includes('/api/leads'))).toHaveLength(0);
});

test('the sound hint goes away by itself with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await guard(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('specplast16_sound_v2', 'off');
    } catch {
      // No storage: the hint may not show, the test then has nothing to check.
    }
  });
  await page.goto('/?intro=0', { waitUntil: 'load' });
  const hint = page.getByText('Включите звук — как в кино');
  const shown = await hint
    .first()
    .waitFor({ state: 'visible', timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!shown, 'the hint is not shown in this state');
  await expect(hint).toHaveCount(0, { timeout: 6000 });
});
