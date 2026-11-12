import { expect, test, type Page } from 'playwright/test';
import { fromPerHour, fromPrice, RATES } from '../src/lib/prices';

// «Уборка снега» (/uborka-snega): the page renders on a phone without sideways
// scroll, its prices are exactly what lib/prices.ts gives, the phone link is
// there and the short form sends a lead with the source `sneg`. Nothing is
// ever sent: every non-GET request is answered here.

const PATH = '/uborka-snega';

async function guard(page: Page) {
  const errors: string[] = [];
  const leads: Record<string, unknown>[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
  });
  await page.route('**/*', (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      if (request.url().includes('/api/leads')) leads.push(request.postDataJSON());
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' });
    }
    if (/\/video\/.+\.(mp4|webm)$/.test(request.url()) || /mc\.yandex\.ru/.test(request.url())) {
      return route.abort();
    }
    return route.continue();
  });
  return { errors, leads };
}

test('sneg: renders at 390 px without sideways scroll, with the phone link', async ({ page }) => {
  const { errors } = await guard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PATH, { waitUntil: 'load' });
  await expect(page.locator('h1')).toContainText('Уборка и вывоз снега');
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
  await expect(page.getByTestId('sneg-call')).toHaveAttribute('href', /^tel:\+7\d{10}$/);
  await expect(page.locator('main a[href^="https://wa.me/"]').first()).toBeVisible();
  // The show layer is on for this page.
  await expect(page.locator('html')).toHaveAttribute('data-show', /full|calm/);
  expect(errors).toEqual([]);
});

test('sneg: prices are the helpers of lib/prices.ts, nothing else', async ({ page }) => {
  await guard(page);
  await page.goto(PATH, { waitUntil: 'load' });
  await expect(page.getByTestId('sneg-price')).toHaveText([
    fromPerHour('loader'),
    fromPerHour('truck'),
    fromPerHour('tractor'),
  ]);
  await expect(page.getByTestId('sneg-package')).toContainText(
    `погрузчик — ${fromPerHour('loader')}, самосвал — ${fromPerHour('truck')}`,
  );
  await expect(page.getByTestId('sneg-total')).toHaveText(fromPrice(RATES.loader + RATES.truck));
  // Own machinery only in Набережные Челны; other cities go to the platform's order form.
  await expect(page.getByTestId('sneg-house')).toContainText('Подача по Челнам в течение 2 часов');
  await expect(page.getByTestId('sneg-other').locator('a[href="/orders"]')).toBeVisible();
  // Structured data: the service and the FAQ.
  const types = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) => nodes.map((n) => JSON.parse(n.textContent ?? '{}')['@type']));
  expect(types).toEqual(expect.arrayContaining(['Service', 'FAQPage']));
});

test('sneg: the form sends a lead with the source sneg', async ({ page }) => {
  const { leads } = await guard(page);
  await page.goto(PATH, { waitUntil: 'load' });
  const form = page.getByTestId('sneg-form');
  await form.locator('input[name="phone"]').fill('+7 (900) 000-00-00');
  await form.locator('input[name="address"]').fill('Набережные Челны, пр. Мира, 1');
  await form.locator('input[name="what"]').fill('парковка у магазина');
  await form.locator('input[name="consent"]').check();
  const submit = form.locator('button[type="submit"]');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('#callback [role="status"]')).toContainText('Заявка у диспетчера');
  expect(leads).toHaveLength(1);
  const lead = leads[0]!;
  expect(String(lead.source)).toMatch(/^sneg · /);
  expect(lead.phone).toBe('+7 (900) 000-00-00');
  expect(lead.consent).toBe(true);
  expect(lead.message).toBe(
    'Уборка снега\nАдрес: Набережные Челны, пр. Мира, 1\nЧто убрать: парковка у магазина',
  );
});

test('sneg: linked from the footer and, in season, from the home page', async ({ page }) => {
  await guard(page);
  await page.goto('/?intro=0', { waitUntil: 'load' });
  await expect(page.locator(`[data-site-footer] a[href="${PATH}"]`)).toHaveCount(1);
  const month = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', month: '2-digit' }).format(
      new Date(),
    ),
  );
  const inSeason = month >= 11 || month <= 3;
  await expect(page.getByTestId('sneg-home-link')).toHaveCount(inSeason ? 1 : 0);
});
