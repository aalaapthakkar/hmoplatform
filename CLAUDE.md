# HMO Platform

## What we are building
A web app for UK HMO landlords, rent to rent operators and letting agents to manage shared houses room by room: properties, rooms, tenancies, onboarding, rent, compliance, maintenance and messaging. Users: org admins, staff, applicants, tenants, guarantors, property owners and suppliers.

## Stack
- Next.js (App Router) with TypeScript in strict mode
- Tailwind CSS and shadcn/ui components
- Supabase: Postgres, Auth, Storage; London region
- Drizzle ORM with SQL migrations committed to Git
- Zod for validating every form and API input
- Vitest for unit tests, Playwright for end to end tests
- Deployed on Vercel

## Non-negotiable rules
- Multi-tenancy: every business table has org_id; Postgres row level security on every table; never bypass it from the client.
- Money: store amounts as integer pence. Never floats. Balances are calculated from charges and payments, never stored and edited.
- History: never hard delete tenancies, payments, documents or notices. Use status fields and keep an audit_log row for every change.
- Dates: store UTC, display Europe/London. UK date format DD/MM/YYYY.
- Secrets only in .env.local; never commit them; never log personal data.
- Original work only: do not copy any competitor's UI, wording, templates or code.
- UK English in all user-facing text. Plain, friendly copy.

## How to work
- For any task touching more than 3 files, propose a plan first and wait for approval.
- After each task: run typecheck, lint and tests, then summarise what changed and what I should click to test it.
- Make small commits with clear messages. One feature per commit.
- If a requirement is unclear, ask me before guessing.

## Commands
- Dev server: `npm run dev` (http://localhost:3000)
- Build: `npm run build` (then `npm run start` to serve it)
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit tests: `npm test` (watch mode: `npm run test:watch`)
- End to end tests: `npm run test:e2e` (builds and serves on port 3217 with dummy Supabase values; first run needs `npx playwright install chromium`)
- Signed-in end to end tests: `npm run test:e2e:live` (against the Supabase project in .env.local, as the test-only E2E_EMAIL/E2E_PASSWORD login and its "E2E test organisation"; skips without them). Each run adds a test property there, since nothing is deleted.
- Format: `npm run format` (check only: `npm run format:check`)
- Database: `npm run db:generate` to create a migration from src/db/schema, `npm run db:migrate` to apply migrations, `npm run db:studio` to browse. Hand-written SQL (policies, functions, triggers) goes in a custom migration: `npx drizzle-kit generate --custom --name <name>`.
- Demo data: `npm run db:seed` (add `-- --email you@example.com` to make an existing account admin of the demo org, or `-- --email you@example.com --into-my-org` to add the demo houses to that account's own org instead). Safe to run more than once.

## Data access
- App code reads and writes through the Supabase clients in src/lib/supabase, which use the signed-in user's session so RLS applies. Drizzle is for schema and migrations only: it connects as the postgres role and bypasses RLS.
- Every new table needs RLS policies in a migration, a test in src/db/rls.test.ts, and matching types in src/lib/supabase/database.types.ts.
- Business tables: use `orgId()` from src/db/schema/_org.ts, add `unique (id, org_id)`, and point at other business rows with composite `(parent_id, org_id)` foreign keys. Add the table to the loop in a migration like 0005_business_rls.sql (policies, no delete, audit) and to BUSINESS_TABLES in src/db/rls.test.ts.
