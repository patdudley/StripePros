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

## Connect Stripe Billing

The app includes a Stripe-hosted subscription Checkout endpoint and a verified webhook receiver. Billing stays safely disabled until you provide Stripe values.

1. Create a Stripe account and remain in **Sandbox/Test mode** while setting up.
2. Create a product named `Stripe Pros` with a recurring monthly price.
3. Copy its `price_...` identifier into `STRIPE_PRICE_ID`.
4. Copy the sandbox secret key into `STRIPE_SECRET_KEY`.
5. Register `https://YOUR-LIVE-SITE/api/stripe/webhook` in Stripe Workbench and subscribe it to:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
6. Copy the resulting signing secret into `STRIPE_WEBHOOK_SECRET`.
7. Leave `STRIPE_AUTOMATIC_TAX=false` until your business address and tax registrations are configured in Stripe.

`POST /api/stripe/checkout` creates a hosted subscription Checkout Session. `GET /api/stripe/config` reports whether billing is configured without exposing secrets. The webhook is verified but does not provision access yet; subscription fields and entitlement handling should be added when the paid plan is finalized.

## Checks

```bash
pnpm test
pnpm lint
pnpm build
```
