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
