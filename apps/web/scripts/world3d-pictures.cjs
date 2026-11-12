// Renders the pictures of the 3D city from the scene itself: the poster of the
// block on the home page and one picture per stop of the walk (a portrait one
// for phones, a landscape one), shown when the live scene is not available.
//
// Not part of the build; run by hand after the scene or the walk shots change:
//   cd apps/web && NODE_PATH=<global node_modules with playwright> node scripts/world3d-pictures.cjs
// Needs Playwright's Chromium (software WebGL is enough) and esbuild, which is
// taken from the test runner's own dependencies.
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const web = path.join(__dirname, '..');
const world = path.join(web, 'src/components/world3d');
const out = path.join(web, 'public/images');

function loadEsbuild() {
  const fromWeb = createRequire(path.join(web, 'package.json'));
  const fromVitest = createRequire(fromWeb.resolve('vitest/package.json'));
  const fromVite = createRequire(fromVitest.resolve('vite/package.json'));
  return fromVite('esbuild');
}

const STOPS = ['excavator', 'crane', 'agp', 'dump'];
const SHAPES = {
  tall: { width: 720, height: 1558 },
  wide: { width: 1600, height: 900 },
};
const POSTER = { width: 1600, height: 900 };

(async () => {
  const bundle = loadEsbuild().buildSync({
    stdin: {
      contents: "import { createWorld } from './scene'; window.createWorld = createWorld;",
      resolveDir: world,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    alias: { '@': path.join(web, 'src') },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    logLevel: 'error',
  }).outputFiles[0].text;
  const html =
    '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000}' +
    'canvas{position:fixed;inset:0;width:100%;height:100%}</style><canvas id="c"></canvas>' +
    '<script src="bundle.js"></script>';

  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  async function open(size) {
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (error) => {
      throw error;
    });
    await page.route('http://world3d.local/**', (route) =>
      route.request().url().endsWith('bundle.js')
        ? route.fulfill({ contentType: 'text/javascript', body: bundle })
        : route.fulfill({ contentType: 'text/html', body: html }),
    );
    await page.goto('http://world3d.local/');
    return page;
  }
  const save = (name, dataUrl) => {
    const file = path.join(out, name);
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(name, Math.round(fs.statSync(file).size / 1024) + ' KB');
  };

  // The block: the district from above, tags on.
  const poster = await open(POSTER);
  const block = await poster.evaluate(() => {
    const canvas = document.getElementById('c');
    window.createWorld({ canvas, phone: false, still: true, onPick() {}, onSlow() {} });
    return [canvas.toDataURL('image/webp', 0.8), canvas.toDataURL('image/jpeg', 0.8)];
  });
  save('world3d-poster.webp', block[0]);
  save('world3d-poster.jpg', block[1]);
  await poster.context().close();

  // The stops: the camera of each stop, no tags (the card names the machine).
  for (const [shape, size] of Object.entries(SHAPES)) {
    const page = await open(size);
    await page.evaluate(() => {
      const canvas = document.getElementById('c');
      window.world = window.createWorld({
        canvas,
        phone: false,
        still: true,
        labels: false,
        onPick() {},
        onSlow() {},
      });
    });
    for (let index = 0; index < STOPS.length; index++) {
      const picture = await page.evaluate((i) => {
        if (i) window.world.walkTo(i);
        else window.world.walkStart(0);
        return document.getElementById('c').toDataURL('image/webp', 0.78);
      }, index);
      save(`world3d-stop-${STOPS[index]}-${shape}.webp`, picture);
    }
    await page.context().close();
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
