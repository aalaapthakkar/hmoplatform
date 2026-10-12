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
(fill in after the project is scaffolded)
