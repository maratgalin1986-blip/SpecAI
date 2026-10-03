import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from 'playwright/test';

// Smoke test of the built site (apps/web/e2e/README is this comment):
//   cd apps/web && npx next build   (dummy DATABASE_URL / DIRECT_URL are enough)
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NODE_PATH=/opt/node22/lib/node_modules \
//     node /opt/node22/lib/node_modules/playwright/cli.js test -c e2e
// It starts `next start` on port 3881 itself unless E2E_BASE_URL points to a
// running server. `playwright` is not a dependency of the workspace (no
// lockfile change): CI installs it next to the checkout, see .github/workflows/e2e.yml.
const PORT = 3881;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: '.',
  // Outside the repo: no .gitignore entry needed.
  outputDir: join(tmpdir(), 'specai-e2e-results'),
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL, browserName: 'chromium' },
  projects: [
    { name: 'iphone-13', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        cwd: '..',
        url: `${baseURL}/robots.txt`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: {
          NEXTAUTH_SECRET: 'e2e',
          NEXTAUTH_URL: baseURL,
          DATABASE_URL: 'postgresql://u:p@localhost:5432/d',
          DIRECT_URL: 'postgresql://u:p@localhost:5432/d',
        },
      },
});
