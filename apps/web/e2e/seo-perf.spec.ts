import { expect, test, type Page } from 'playwright/test';

// Search and speed basics that are easy to lose with a new page or block:
// the seasonal page carries a full preview card built by lib/pageMeta.ts,
// the job-site photos reserve their box and come through the image optimizer,
// and scrolling the home page end to end does not move what is on screen.
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

test('the snow page carries its own preview card within the limits', async ({ request }) => {
  const response = await request.get('/uborka-snega');
  expect(response.status()).toBe(200);
  const html = await response.text();
  const head = html.slice(0, html.indexOf('</head>'));
  const meta = (property: string) =>
    new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(head)?.[1] ?? null;
  const title = /<title>([^<]+)<\/title>/.exec(head)?.[1] ?? '';
  expect(title).toContain('снег');
  expect(title.length, `«${title}»`).toBeLessThanOrEqual(65);
  const description = /<meta name="description" content="([^"]*)"/.exec(head)?.[1] ?? '';
  expect(description.length).toBeGreaterThan(50);
  expect(description.length).toBeLessThanOrEqual(160);
  // Whole sentences only: the snippet does not end mid-price.
  expect(description).toMatch(/[.!?…]$/);
  expect(meta('og:title')).toContain('снег');
  expect(meta('og:url')).toMatch(/\/uborka-snega\/?$/);
  expect(meta('og:image')).toMatch(/^https?:\/\/.+\.(png|jpe?g|webp)/);
  expect(meta('og:image:width')).toBe('1200');
  expect(meta('og:image:height')).toBe('630');
  expect(head).toMatch(/<link rel="canonical" href="[^"]*\/uborka-snega\/?"/);
});

test('job-site photos reserve their box and come through the image optimizer', async ({ page }) => {
  await open(page, '/');
  const photos = page.locator('figure img[alt*="объект"]');
  const count = await photos.count();
  // The block is hidden while lib/objectPhotos.ts is empty.
  test.skip(count === 0, 'no job-site photos published');
  for (let index = 0; index < count; index += 1) {
    const photo = photos.nth(index);
    expect(Number(await photo.getAttribute('width')), 'width').toBeGreaterThan(0);
    expect(Number(await photo.getAttribute('height')), 'height').toBeGreaterThan(0);
    expect(await photo.getAttribute('loading')).toBe('lazy');
    expect(await photo.getAttribute('srcset'), 'srcset').toContain('/_next/image');
    expect(await photo.getAttribute('sizes'), 'sizes').toBeTruthy();
  }
  // The box is 3:4 before the file arrives (no jump when it does).
  const first = photos.first();
  await first.scrollIntoViewIfNeeded();
  const box = (await first.boundingBox())!;
  expect(box.height / box.width).toBeGreaterThan(1.25);
  expect(box.height / box.width).toBeLessThan(1.42);
  // A phone gets a copy several times lighter than the 170–290 KB original.
  // The optimizer makes the copy on the first request: on a cold CI server
  // that alone can take several seconds. What is checked is the weight.
  await expect
    .poll(() => first.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 15_000 })
    .toBeGreaterThan(0);
  const bytes = await first.evaluate(async (img: HTMLImageElement) => {
    const entry = performance.getEntriesByName(img.currentSrc)[0] as
      PerformanceResourceTiming | undefined;
    return entry?.encodedBodySize || (await (await fetch(img.currentSrc)).blob()).size;
  });
  expect(bytes, 'bytes of the served copy').toBeLessThan(150_000);
});

test('scrolling the home page end to end does not shift the layout', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { cls: 0 };
    (window as unknown as { __shift: typeof state }).__shift = state;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[]) {
        if (!entry.hadRecentInput) state.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await open(page, '/');
  await page.waitForTimeout(2000);
  await page.evaluate(async () => {
    const height = document.documentElement.scrollHeight;
    const steps = 120;
    for (let step = 0; step <= steps; step += 1) {
      window.scrollTo(0, ((height - innerHeight) * step) / steps);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
  await page.waitForTimeout(1500);
  const cls = await page.evaluate(
    () => (window as unknown as { __shift: { cls: number } }).__shift.cls,
  );
  // «Good» is up to 0.1; blocks that change height off screen once gave 0.4–0.9.
  expect(cls).toBeLessThan(0.1);
});
