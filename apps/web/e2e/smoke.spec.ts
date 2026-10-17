import { expect, test, type Page } from 'playwright/test';

// The owner's rules on every key page: no script errors, the phone is in
// reach, no links to other websites (only WhatsApp, tel: and mailto:), the
// brand is never shortened to «СП16». Nothing is ever sent: every non-GET
// request (leads, photos, chat) is answered here.

const PAGES = [
  '/?intro=0',
  '/pravila',
  '/contacts',
  '/soglasie',
  '/privacy',
  '/arenda/samosval',
  // A city of the all-Russia list (lib/cities.ts); without a database nobody serves it yet.
  '/arenda/ekskavator-pogruzchik/kazan',
  '/kak-polzovatsya',
  '/predlozheniya',
];

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

    // An honest city page: no providers there yet → no invented machines or prices.
    if (path.endsWith('/kazan')) {
      await expect(page.getByRole('heading', { level: 1 })).toContainText('в Казани');
      await expect(page.getByTestId('city-joining')).toContainText(
        'Исполнители в Казани подключаются — оставьте заявку, мы найдём технику.',
      );
      await expect(page.getByTestId('landing-price')).toHaveCount(0);
      await expect(page.getByTestId('fleet-card-price')).toHaveCount(0);
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

// «Предложения и партнёрство»: errors under the fields, then the thank-you.
test('proposal form: inline errors, then sent', async ({ page }) => {
  const errors = await guard(page);
  const sent: { body?: Record<string, unknown> } = {};
  await page.route('**/api/proposals', (route) => {
    sent.body = route.request().postDataJSON();
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto('/predlozheniya', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText('Как к вам обращаться?')).toBeVisible();
  await expect(page.getByText('Нужно согласие на обработку персональных данных')).toBeVisible();
  expect(sent.body).toBeUndefined();

  await page.getByText('Сотрудничество и партнёрство').click();
  await page.getByLabel('Имя').fill('Тест');
  await page.getByLabel('Телефон или e-mail для ответа').fill('test@example.com');
  await page.getByLabel('Расскажите подробнее').fill('Предлагаем совместную рекламу техники.');
  await page.locator('input[name="consent"]').check();
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText('Спасибо! Мы прочитаем и ответим.')).toBeVisible();
  expect(sent.body).toMatchObject({
    kind: 'PARTNERSHIP',
    contact: 'test@example.com',
    consent: true,
  });
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

// The consent strip must be seen and tapped on the home page over the hero
// (Metrika waits for it).
test('cookie strip visible and clickable on the home page', async ({ page }) => {
  const errors = await guard(page);
  await page.goto('/?intro=0', { waitUntil: 'load' });
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

// «Вход на стройку», «Смета» and «Дизайн» are gone from the site (owner,
// 2026-10-15): their old addresses land on the home page, nothing else.
test('removed pages redirect to the home page', async ({ page }) => {
  const errors = await guard(page);
  for (const path of ['/stroyka', '/stroyka/kotlovan', '/smeta', '/kalkulyator', '/dizain']) {
    await page.goto(path, { waitUntil: 'load' });
    expect(new URL(page.url()).pathname, path).toBe('/');
  }
  expect(errors, 'page errors').toEqual([]);
});

// «Установить на экран»: not on the first visit, from the second one on; it
// never covers the call bar, has 44 px buttons, and ✕ closes it for good.
test('install hint on the second visit, closed for good', async ({ page }, testInfo) => {
  const phone = testInfo.project.name === 'iphone-13';
  const errors = await guard(page);
  await page.addInitScript((native) => {
    // Automated browsers never get the hint; this test plays a person.
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    try {
      localStorage.setItem('cookie-consent', 'yes');
      if (!localStorage.getItem('specai:visits')) {
        localStorage.setItem(
          'specai:visits',
          JSON.stringify({ count: 1, last: Date.now() - 2 * 3_600_000 }),
        );
      }
    } catch {
      /* storage blocked */
    }
    if (native) {
      // Chrome on a computer (headless Chromium says «HeadlessChrome», a bot):
      // the browser offers installation.
      const ua = navigator.userAgent.replace('HeadlessChrome', 'Chrome');
      Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => ua });
      addEventListener('DOMContentLoaded', () => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        Object.assign(event, {
          prompt: () => Promise.resolve(),
          userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
        });
        dispatchEvent(event);
      });
    }
  }, !phone);
  await page.goto('/?intro=0', { waitUntil: 'load' });
  const hint = page.getByTestId('install-hint');
  await expect(hint).toBeVisible({ timeout: 15_000 });
  await expect(hint).toBeInViewport();
  if (phone) {
    // Chromium with the iPhone's user agent: Safari's two taps.
    await expect(hint).toContainText('Установить ИИСтройка24 на телефон');
    await expect(hint).toContainText('«На экран „Домой“»');
    const bar = page.getByRole('navigation', { name: 'Быстрая связь' });
    const barBox = (await bar.boundingBox())!;
    const hintBox = (await hint.boundingBox())!;
    expect(hintBox.y + hintBox.height, 'the hint sits above the call bar').toBeLessThanOrEqual(
      barBox.y,
    );
    const callFree = await bar.locator('a[href^="tel:"]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    });
    expect(callFree, 'nothing covers «Позвонить»').toBe(true);
  } else {
    const install = hint.getByRole('button', { name: 'Установить' });
    await expect(install).toBeVisible();
    expect((await install.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  const close = hint.getByRole('button', { name: 'Закрыть подсказку об установке' });
  expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(hint).toHaveCount(0);
  const dismissed = await page.evaluate(() =>
    localStorage.getItem('specai:install-hint-dismissed'),
  );
  expect(dismissed).toBe('1');
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(8_000);
  await expect(hint).toHaveCount(0);
  expect(errors, 'page errors').toEqual([]);
});
