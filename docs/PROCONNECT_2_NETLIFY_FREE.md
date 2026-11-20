# Superior ProConnect 2.0 — Netlify Free commercial build

Source: GitHub branch `superior-proconnect-2-netlify-free`. This is a fresh, isolated source build, not proof of a live deployment.

## Hosting and commercial terms
Netlify Free explicitly permits commercial sites and apps. Netlify Free credits have a monthly cap and the site can be paused when it is reached; no paid hosting plan is required. Netlify Server currently has Early Access conditions. Netlify Database is the intended persistent Postgres backend and also consumes free credits; it is not unlimited.

## Features and clean records
Reuse the existing customer job posting and private quote selection; separate Construction and Automotive networks; Pro profiles and dashboards; owner Command Center; quotes, estimates and invoices; rules and policies; installable mobile web app; and PayPal membership and estimate checkout references. Preserve the exact approved three image assets already in `public/logos/`. No customers, jobs, estimates, invoices, reviews, paid memberships, subscriptions, tokens or historic records are imported. The featured Superior Maintenance and Remodeling business listing is intentionally retained.

## New Netlify site
Create a NEW Netlify Free site linked to `superiormandr-star/Handymanservicesapp` on branch `superior-proconnect-2-netlify-free`. Publish directory: `public`. Netlify Server entry: `netlify/server/index.mjs`. Netlify Database migration: `netlify/database/migrations/202611190001_fresh_state.sql`. It must provision a database; no API can silently fall back to local temporary storage.

Configure *private* site environment variables:
- `ADMIN_TOKEN`: new long random secret (32+ characters).
- `BACKUP_ENCRYPTION_KEY`: newly generated 64-character hexadecimal key. Back it up privately; losing this key makes encrypted data unrecoverable.
- `SPC_ALLOW_INITIALIZE=true` only on first initialization, then remove it.
- `SPC_WRITES_ENABLED=true` and `SPC_PERSISTENCE_VERIFIED=true` only AFTER a successful database persistence check across a redeploy.

Never commit these secrets. Confirm the site plan is Free without auto-recharge. Create an offsite backup and test recovery before paid launch: Netlify Free Database has limited built-in recovery retention.

## Business launch safety
PayPal's six existing subscription plan references and two distinct one-time estimate links are preserved, NOT replaced. Owner approval and screenshot plan names alone do not prove exact prices, renewals, webhook fulfillment or server-side membership activation. Do not claim any paid membership was activated or that payments were tested until a confirmed end-to-end billing test passes.

The existing Vercel production URL and source main branch must not be changed until the new independent site is validated.
