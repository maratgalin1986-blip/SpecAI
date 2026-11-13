import { expect, test, type Page } from 'playwright/test';

// Weight and search basics of the public pages (2026-11-13):
// - a phone gets no background video by itself (lib/phoneVideo.ts): the
//   poster frame stays until the first touch, then at most one clip plays,
//   and form, machine and job pages never fetch a clip;
// - looping effects rest in sections far from the screen (AnimationPause);
// - machine and job pages carry BreadcrumbList that matches the visible
//   crumbs, and the crumb links are at least 24 px tall.
// Nothing is sent: every non-GET request is answered here; clips are counted
// and then aborted, so no video is downloaded by the test.

async function open(page: Page, path: string) {
  const clips: string[] = [];
  await page.route('**/*', (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' });
    }
    if (/\/(video|loops)\/.+\.(mp4|webm)(\?|$)/.test(request.url())) {
      clips.push(new URL(request.url()).pathname);
      return route.abort();
    }
    if (/mc\.yandex\.ru/.test(request.url())) return route.abort();
    return route.continue();
  });
  await page.goto(path, { waitUntil: 'load' });
  return clips;
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 640;

test('a phone starts no clip by itself, and one at most after a touch', async ({ page }) => {
  test.skip(!isPhone(page), 'phone rule');
  const clips = await open(page, '/?intro=0');
  // Longer than any idle timer the clips used to have (2.5 s after load).
  await page.waitForTimeout(5000);
  expect(clips, 'clips before a touch').toEqual([]);
  await page.locator('main h1').first().tap();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(3000);
  expect(await page.locator('video').count(), 'video elements').toBeLessThanOrEqual(1);
  expect(new Set(clips).size, `clips after a touch: ${clips.join(', ')}`).toBeLessThanOrEqual(1);
});

for (const path of ['/contacts', '/arenda/ekskavator-pogruzchik', '/raboty/kopka-transhei']) {
  test(`a phone keeps ${path} to the poster frame`, async ({ page }) => {
    test.skip(!isPhone(page), 'phone rule');
    const clips = await open(page, path);
    await page.waitForTimeout(3000);
    await page.locator('main h1').first().tap();
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(2500);
    expect(clips).toEqual([]);
    expect(await page.locator('video').count()).toBe(0);
  });
}

test('loops rest in a section far from the screen', async ({ page }) => {
  await open(page, '/?intro=0');
  const hero = page.locator('main section').first();
  await expect(hero).not.toHaveAttribute('data-fx-off');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(hero).toHaveAttribute('data-fx-off', '');
  const running = await hero.evaluate((el) =>
    el
      .getAnimations({ subtree: true })
      .filter((a) => a.effect?.getTiming().iterations === Infinity && a.playState === 'running')
      .map((a) => (a as CSSAnimation).animationName),
  );
  expect(running).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(hero).not.toHaveAttribute('data-fx-off');
});

for (const [path, names] of [
  ['/arenda/ekskavator-pogruzchik', ['Главная', 'Экскаваторы-погрузчики']],
  ['/raboty/kopka-transhei', ['Главная', 'Работы и цены']],
  ['/uborka-snega', ['Главная', 'Уборка снега']],
] as const) {
  test(`${path} carries BreadcrumbList with tappable crumbs`, async ({ page, request }) => {
    const html = await (await request.get(path)).text();
    const lists = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]!) as { '@type': string; itemListElement?: { name: string }[] })
      .filter((ld) => ld['@type'] === 'BreadcrumbList');
    expect(lists).toHaveLength(1);
    const crumbs = lists[0]!.itemListElement!.map((item) => item.name);
    expect(crumbs.slice(0, names.length)).toEqual([...names]);
    await open(page, path);
    const home = page.getByRole('navigation', { name: 'Навигационная цепочка' }).getByRole('link', {
      name: 'Главная',
    });
    const box = (await home.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(24);
  });
}
