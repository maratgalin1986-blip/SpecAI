# SpecAI

AI platform for heavy equipment rental and construction services.

## Overview

SpecAI is a marketplace that connects construction companies with heavy equipment
providers (excavators, cranes, bulldozers, etc.), layered with AI features:

- **Equipment recommendation** — describe a job and get ranked equipment matches
  from available inventory, with a rationale for each pick.
- **Spec extraction** — paste a manufacturer spec sheet or listing description and
  get structured make/model/year/technical specs back.
- **Support assistant** — a conversational assistant for booking and policy questions.

## Repository structure

Monorepo managed with pnpm workspaces:

```
apps/
  web/                Next.js 14 (App Router) app — customer-facing site + API routes
packages/
  database/           Prisma schema and client (Postgres)
  shared/             Zod schemas/types shared between the app and API boundaries
  ui/                 Shared React components (Tailwind-based)
  ai-service/         Anthropic-backed AI features (recommendation, spec extraction, chat)
```

### Domain model (`packages/database/prisma/schema.prisma`)

- `User` / `Company` / `Location` — identity and org structure. A `Company` can be
  an equipment provider (`isProvider`), a customer org, or both.
- `EquipmentCategory` / `Equipment` / `MaintenanceRecord` — the fleet catalog.
  `Equipment.specs` is a free-form JSON field populated manually or via AI spec
  extraction, since technical specs vary widely across equipment types.
- `Booking` / `Document` / `Review` — the rental lifecycle: booking a piece of
  equipment for a date range, attaching contracts/insurance/inspection docs, and
  reviewing after completion.
- `AiConversation` / `AiMessage` — persisted history for AI assistant interactions.

## Getting started

Requires Node 20+ and pnpm.

```bash
cp .env.example .env      # set DATABASE_URL, ANTHROPIC_API_KEY, NEXTAUTH_SECRET
docker compose up -d      # local Postgres
pnpm install
pnpm db:generate
pnpm db:push               # sync schema to the database
pnpm db:seed                # optional: sample companies/equipment/users
pnpm dev                   # runs apps/web on http://localhost:3000
```

Seeded accounts (see `packages/database/prisma/seed.ts`):

- Provider admin: `provider@example.com` / `provider123`
- Customer: `customer@example.com` / `customer123`

## Deploying to a public URL

The commands above only run the app on `localhost`. To get a URL reachable from
any device — phone, another computer, anywhere — deploy to a host with a public
address. The stack (Next.js + Postgres) maps cleanly onto **Vercel** (app) +
**Neon** (Postgres), both of which have a free tier and need no server management.

1. **Database** — create a free project at [neon.tech](https://neon.tech) (or
   Supabase, or any managed Postgres). Copy the connection string it gives you;
   that's your `DATABASE_URL`.
2. **App** — go to [vercel.com](https://vercel.com), "Add New Project", import
   this GitHub repo.
   - Framework preset: Next.js (auto-detected).
   - **Root Directory**: set to `apps/web` (this is a monorepo — Vercel needs
     to know the Next.js app isn't at the repo root).
   - Environment variables: `DATABASE_URL` (from step 1), `NEXTAUTH_SECRET`
     (any random string — `openssl rand -base64 32`), `NEXTAUTH_URL` (your
     Vercel deployment URL, e.g. `https://your-app.vercel.app`), and
     `ANTHROPIC_API_KEY` if you want the AI features live.
3. Deploy. `apps/web`'s `build` script (`pnpm --filter @specai/database push
   && pnpm --filter @specai/database ensure-categories && next build`) syncs
   the Prisma schema to whatever `DATABASE_URL` points at and seeds the base
   equipment categories on every build — no separate manual step, and safe to
   re-run since both are idempotent. It deliberately does **not** run the full
   `prisma/seed.ts` (fake companies, hardcoded `provider123`/`customer123`
   passwords) against a real deployment — that script is for local dev only.
   Register real accounts via `/register` on the deployed site instead.

After that, the Vercel URL works from any device on any network — no tunnel,
no local server required.

## Scripts

Run from the repo root:

- `pnpm dev` — start the web app in development mode
- `pnpm build` — build all packages and the web app
- `pnpm lint` — lint the whole workspace
- `pnpm typecheck` — typecheck all packages
- `pnpm db:generate` / `pnpm db:push` / `pnpm db:studio` / `pnpm db:seed` — Prisma workflows

## Application features implemented so far

- **Auth** — email/password via NextAuth (JWT sessions). `/register` supports both
  account types: renting customers, and providers (creates a `Company` with
  `isProvider: true` and a `PROVIDER_ADMIN` user in one transaction). `/dashboard`
  and `/provider` are auth-gated by `apps/web/src/middleware.ts`.
- **Equipment catalog** — `/equipment` listing with a filter form (category, city,
  price range, text search) and `/equipment/[id]` detail pages, including average
  rating and reviews; `GET/POST /api/equipment` for search and (provider-only)
  listing.
- **Bookings** — `POST /api/bookings` validates date ranges, rejects overlapping
  bookings for the same equipment, and computes the total price server-side; the
  equipment detail page includes a booking form for signed-in customers, and
  `/dashboard` lists the current user's bookings. `PATCH /api/bookings/[id]` drives
  the booking state machine (provider confirms/activates/completes/cancels,
  customer can cancel a pending/confirmed booking).
- **Provider dashboard** — `/provider` lists a provider's equipment and incoming
  bookings with approve/cancel/complete actions, and a form to list new equipment,
  including an AI-assisted "paste a spec sheet" flow.
- **Reviews** — after a booking is `COMPLETED`, the customer can leave a rating and
  comment (`POST /api/reviews`), shown on the equipment detail page.
- **AI recommendation** — `/recommend` page and `POST /api/ai/recommend` rank
  available equipment against a free-text job description using Claude tool calls.
- **Dispatch (orders & bids)** — `/orders` lets a customer post a job request
  (what's needed, category, date range) without picking a specific listing up
  front — a taxi-style counterpart to browsing the catalog. Providers browse
  open orders and submit a `Bid` (their equipment + price) via
  `POST /api/orders/[id]/bids`; the customer accepts one via
  `POST /api/bids/[id]/accept`, which atomically creates a `Booking`, marks
  the order `MATCHED`, and rejects the other bids.

## AI service usage

`packages/ai-service` exposes three functions consumed by `apps/web`:

- `recommendEquipment(jobDescription, candidates)` — tool-call based ranking of
  candidate equipment against a natural-language job description.
- `extractEquipmentSpecs(sourceText)` — structured spec extraction from free text.
- `replyToCustomer(history)` — a support chat turn given conversation history.

All three require `ANTHROPIC_API_KEY` to be set.
