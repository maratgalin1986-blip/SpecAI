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

## Scripts

Run from the repo root:

- `pnpm dev` — start the web app in development mode
- `pnpm build` — build all packages and the web app
- `pnpm lint` — lint the whole workspace
- `pnpm typecheck` — typecheck all packages
- `pnpm db:generate` / `pnpm db:push` / `pnpm db:studio` / `pnpm db:seed` — Prisma workflows

## Application features implemented so far

- **Auth** — email/password via NextAuth (JWT sessions); `/register` and `/login`
  pages, `/dashboard` is auth-gated by `apps/web/src/middleware.ts`.
- **Equipment catalog** — `/equipment` listing and `/equipment/[id]` detail pages
  reading from Postgres via Prisma; `GET/POST /api/equipment` for search and listing.
- **Bookings** — `POST /api/bookings` validates date ranges, rejects overlapping
  bookings for the same equipment, and computes the total price server-side; the
  equipment detail page includes a booking form for signed-in users, and
  `/dashboard` lists the current user's bookings.
- **AI recommendation** — `/recommend` page and `POST /api/ai/recommend` rank
  available equipment against a free-text job description using Claude tool calls.

## AI service usage

`packages/ai-service` exposes three functions consumed by `apps/web`:

- `recommendEquipment(jobDescription, candidates)` — tool-call based ranking of
  candidate equipment against a natural-language job description.
- `extractEquipmentSpecs(sourceText)` — structured spec extraction from free text.
- `replyToCustomer(history)` — a support chat turn given conversation history.

All three require `ANTHROPIC_API_KEY` to be set.
