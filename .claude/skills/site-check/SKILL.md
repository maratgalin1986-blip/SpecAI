---
name: site-check
description: Full local check of the СпецПласт16 web app before a push — lint, typecheck, tests, format, build, and a Playwright smoke run on iPhone 13 and desktop with leads intercepted. Use before every push or after merging work.
---

1. Checks from the repo root (agent worktrees under `.claude/` break plain `pnpm lint`):
   ```
   npx eslint . --max-warnings 0 --ignore-pattern '.claude/**' && pnpm typecheck && pnpm test && npx prettier --check apps/web/src
   ```
2. Build without a database:
   ```
   cd apps/web && DATABASE_URL=postgresql://u:p@localhost:5432/d DIRECT_URL=postgresql://u:p@localhost:5432/d npx next build
   ```
3. Serve it. Kill old servers by PID only — `pkill -f`/`pgrep -f` kill your own shell:
   ```
   ps -eo pid,comm | awk '$2 ~ /next-server/ {print $1}' | xargs -r kill
   (NEXTAUTH_SECRET=x DATABASE_URL=postgresql://u:p@localhost:5432/d nohup npx next start -p 3901 >/dev/null 2>&1 &)
   ```
4. Playwright (Chromium is preinstalled; never `playwright install`): `NODE_PATH=/opt/node22/lib/node_modules node script.js`,
   `devices['iPhone 13']` and 1280×720. In every context:
   - `page.route(/\/video\//, r => r.abort())` — videos stall headless pages;
   - `page.route(/\/api\/(leads|photos)/, r => r.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' }))` — never send real leads; test phone +7 900 000-00-00;
   - skip the intro with `?intro=0`; collect `pageerror`; check `scrollWidth > innerWidth` (horizontal scroll).
5. Without a DB the catalog, /equipment and /orders render empty or 500 locally — not a bug.
6. Kill the server by PID when done. Merge `origin/main` before pushing (CLAUDE.md rule 1).
