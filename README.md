# Stripe Pros

Stripe Pros is a measurement-assisted quoting application for parking lot striping contractors. V1 is organized into six reviewable milestones; this repository currently contains M1.

## M1 — account and price book foundation

- single-user email/password accounts with PBKDF2 password hashing and secure sessions
- Postgres data model for users, customers, sites, quotes, snapshot line items, geometries, and ADA assessments
- Drizzle migration in `drizzle/`
- 21 editable striping-native default price book items seeded for every new account
- account-scoped price book create, read, update, and delete endpoints

Mapping, quote calculation, ADA, PDF export, and quote management are intentionally deferred to later milestones.

## Local setup

Requirements: Node.js 22.13+ and a Neon or Supabase Postgres database.

1. Copy `.env.example` to `.env.local`.
2. Set `DATABASE_URL` and a random `SESSION_SECRET` of at least 32 characters.
3. Install dependencies with `pnpm install`.
4. Apply the migration with `pnpm db:migrate`.
5. Start the app with `pnpm dev`.

## Checks

```bash
pnpm test
pnpm lint
pnpm build
```
