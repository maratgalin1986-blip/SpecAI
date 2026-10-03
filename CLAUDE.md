# SpecAI / СпецПласт16 — notes for Claude sessions

Several Claude sessions work on this repository at the same time, each on its
own branch and PR. Read this before touching anything.

## Areas and who owns them

| Area                                | Paths                                                                                                                                   | Session (branch)                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Public site, branding, leads, admin | `apps/web/src/app/**` (pages), `apps/web/src/components/**`, `packages/shared/src/schemas/{lead,agents}.ts`                             | «Сайт для спецпласт16 с ИИ агентами» (`claude/specplast16-website-ai-agents-*`) |
| Mobile app, mobile auth, PWA        | `apps/mobile/**`, `apps/web/src/app/api/mobile/**`, `apps/web/src/lib/{mobileAuth,requestUser}.ts`, `apps/web/src/app/{manifest,sw}.ts` | «Приложение» (`claude/token-recovery-agent-tasks-*`)                            |
| Database, deploy, CI                | `packages/database/**`, `.github/**`, `.env.example`                                                                                    | shared — see the rules below                                                    |

If you are a new session: pick an area, say so in your PR title, and stay out
of the others unless the change is required for your feature. When a shared
file must change (schema, README, `.env.example`, lockfile), keep the hunk
small so merges stay conflict-free.

## Rules that already cost us time

1. **Merge `origin/main` into your branch before every push** and re-run
   `pnpm lint && pnpm typecheck && pnpm test`. Main moves several times a day.
2. **Schema changes go through `prisma db push` on deploy**, with no migration
   history. Adding a column with a default is safe. Adding a value to an
   existing `enum` is not: `ALTER TYPE ... ADD VALUE` cannot run through the
   pooled connection, and the Vercel build dies before `next build`. Use a
   column instead, or ask the owner to set `DIRECT_URL` in Vercel first.
3. **The database is Yandex Managed PostgreSQL** (see
   `packages/database/src/connection.ts`). A branch without that code cannot
   connect from Vercel, so previews of stale branches fail in ~15 s. If your
   preview fails that fast, merge main first, then investigate.
4. **Never disable, delete or reschedule another session's scheduled tasks**
   (Routines / reminders). One session switched off another's reminders on
   2026‑09‑27; it took a while to notice.
5. `pnpm build` at the root runs `db push` and seeds; for a local check use
   `cd apps/web && npx next build` with dummy `DATABASE_URL`/`DIRECT_URL`.
6. Commits and PRs end with the attribution lines the session is given; do not
   put model names into code, comments or commit messages.
7. **A green Vercel build does not mean production works.** On 2026‑09‑29
   every database request in production failed with "Prisma Client could not
   locate the Query Engine for runtime rhel-openssl-3.0.x" while the build
   passed; Prisma's monorepo plugin in `apps/web/next.config.mjs` fixes it
   (#17), keep it. After a production deploy open
   `https://spec-ai-web.vercel.app/api/categories` (must be 200); if it fails,
   read Vercel → Logs first.
8. **Secrets for cloud sessions are plain environment variables** of the cloud
   environment (that is how `EXPO_TOKEN` works); the "API credentials" form did
   not reach the CLI. Only a new container sees a new value, and each service
   host must also be allowed under Network access. Never ask the owner to paste
   a secret into the chat.

## Project facts

- **Business model (owner's later decision, 2026-10-02, replaces the aggregator):
  only СпецПласт16.** Customers see only the house fleet (`PUBLIC_FLEET` in
  `apps/web/src/lib/fleet.ts`), provider sign-up is closed
  (`PROVIDER_SIGNUP_OPEN` in `app/api/auth/register/route.ts`), there are no links
  to other websites, and construction materials are sold by СпецПласт16 itself
  (`lib/smetaPrices.ts`). The platform is called «ИИСтройка24 от СпецПласт16» (owner, 2026-10-03; domain to buy: iistroyka24.ru)
  (`SITE.platform`); prices live in `lib/prices.ts`. Details:
  `docs/owner-requests.md`. Do not bring the marketplace back without the owner.
- Shared memory lives in the repo: `docs/owner-requests.md` (the owner's
  requests and their status), `docs/ai-office.md` (how the sessions work
  together, lessons log), `docs/marketing.md`.
- The mobile app is on Expo: project `@maratgalin1986s-team/specai`, EAS Update
  branch `preview` for Expo Go; steps in `apps/mobile/README.md`.
- pnpm 10 workspaces, Node 20 in CI. Packages: `apps/web` (Next.js 14),
  `apps/mobile` (Expo SDK 57), `packages/{database,shared,ui,ai-service}`.
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`
  (vitest 4 — vitest 5 needs Node 22 and breaks CI), and for the app
  `cd apps/mobile && npx expo export --platform android`.
- Auth: NextAuth credentials for the web, Bearer JWT for mobile; API routes
  use `getRequestUser(request)` so both work.
- Payments: Stripe Checkout + webhook; refunds are manual
  (`Payment.refundRequired`). Emails: Resend. Files: Vercel Blob.
- Emails are trimmed and lower-cased on input; lookups fall back to a
  case-insensitive match for accounts created before that.
