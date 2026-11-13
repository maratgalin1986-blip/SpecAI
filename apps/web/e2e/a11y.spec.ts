import { expect, test, type Page } from 'playwright/test';

// Keyboard, touch and link-preview basics of the public pages: the phone menu
// behaves as a dialog, form fields do not make iOS zoom the page (16 px) and
// are big enough to tap, every page type carries its own preview card.
// Nothing is sent: every non-GET request is answered here.

async function open(page: Page, path: string) {
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
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

test('phone menu: focus moves in, Tab stays inside, Esc closes and returns focus', async ({
  page,
}) => {
  test.skip(!isPhone(page), 'the menu button exists below 1024 px');
  await open(page, '/contacts');
  const button = page.getByRole('button', { name: 'Открыть меню' });
  await button.click();
  const menu = page.locator('#mobile-nav');
  await expect(menu).toBeVisible();
  // Focus is on the first link of the menu; the page behind takes no focus.
  await expect(menu.getByRole('link').first()).toBeFocused();
  await expect(page.locator('main')).toHaveAttribute('inert', '');

  // Shift+Tab from the first link goes to the menu button, once more — to the
  // last control of the menu: focus never leaves the open menu.
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Закрыть меню' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Закрыть меню' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeFocused();
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
});

test('order form on a 390 px phone: 16 px fields, 44 px controls, 24 px consent tick', async ({
  page,
}) => {
  test.skip(!isPhone(page), 'phone layout');
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/orders#new');
  const form = page.locator('#new form').last();
  await expect(form).toBeVisible();
  const fields = await form
    .locator('input:not([type=hidden]):not([type=checkbox]):not([type=file]), select, textarea')
    .evaluateAll((els) =>
      els
        .filter((el) => el.getBoundingClientRect().height > 0)
        .map((el) => ({
          name: el.getAttribute('name') ?? el.getAttribute('placeholder') ?? el.tagName,
          font: parseFloat(getComputedStyle(el).fontSize),
          height: Math.round(el.getBoundingClientRect().height),
        })),
    );
  expect(fields.length).toBeGreaterThanOrEqual(5);
  for (const field of fields) {
    expect(field.font, `font of ${field.name}`).toBeGreaterThanOrEqual(16);
    expect(field.height, `height of ${field.name}`).toBeGreaterThanOrEqual(44);
  }
  const tick = (await form.locator('input[type=checkbox]').first().boundingBox())!;
  expect(Math.min(tick.width, tick.height)).toBeGreaterThanOrEqual(24);
  const submit = (await form.getByRole('button', { name: 'Опубликовать заявку' }).boundingBox())!;
  expect(submit.height).toBeGreaterThanOrEqual(44);
});

test('home, a landing and a job page carry their own preview card', async ({ request }) => {
  const meta = (html: string, property: string) =>
    new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(html)?.[1] ?? null;
  const titles = new Set<string>();
  for (const path of ['/', '/arenda/ekskavator-pogruzchik', '/raboty/kopka-transhei', '/map']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    const head = html.slice(0, html.indexOf('</head>'));
    // Inside <head>, for every visitor (not streamed into <body>).
    expect(head, `${path}: <title> in head`).toMatch(/<title>[^<]+<\/title>/);
    const title = /<title>([^<]+)<\/title>/.exec(head)![1]!;
    expect(title.length, `${path}: «${title}»`).toBeLessThanOrEqual(65);
    expect(meta(head, 'og:image'), `${path}: og:image`).toMatch(/^https?:\/\/.+\.(png|jpe?g|webp)/);
    expect(meta(head, 'og:url'), `${path}: og:url`).toMatch(
      new RegExp(`${path === '/' ? '' : path}/?$`),
    );
    const ogTitle = meta(head, 'og:title');
    expect(ogTitle, `${path}: og:title`).toBeTruthy();
    titles.add(ogTitle!);
    const description = /<meta name="description" content="([^"]*)"/.exec(head)?.[1] ?? '';
    expect(description.length, `${path}: description`).toBeGreaterThan(50);
    expect(description.length, `${path}: description`).toBeLessThanOrEqual(160);
  }
  // Each page has its own og:title, not the home page's.
  expect(titles.size).toBe(4);
});

test('favicon.ico is served and the sitemap dates pages only by their data', async ({
  request,
}) => {
  const icon = await request.get('/favicon.ico');
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toMatch(/icon/);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const urls = sitemap.match(/<url>/g)?.length ?? 0;
  expect(urls).toBeGreaterThan(20);
  // No build time as «last modified» (lib/sitemapPages.ts): the fixed pages
  // carry no <lastmod>, and every date given is a real one.
  const home = /<url>\s*<loc>[^<]*?\/?<\/loc>([\s\S]*?)<\/url>/.exec(sitemap)?.[1] ?? '';
  expect(home).not.toContain('<lastmod>');
  for (const [, date] of sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g))
    expect(Number.isNaN(Date.parse(date!)), date).toBe(false);
});
