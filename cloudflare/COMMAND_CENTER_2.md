# Superior ProConnect 2.0 — Owner Command Center

This is a new owner administration application, **not** the legacy Superior Command Center.

Dedicated production host: `superior-proconnect-2.superiormandr.workers.dev`
Dedicated Worker: `superior-proconnect-2`
Primary database: `superior-proconnect-data` (only `spc2_` tables for this version)
Separate backup database: `superior-proconnect-2-backups` (UUID `e83c1b74-e52e-4c3b-b5ed-2012be8b4703`)

## Required owner functions
- Secure owner sign-in with a server-side secret and session protections.
- Customer job review, private details only after authenticated authorization.
- Construction and Automotive professionals, memberships and entitlement management.
- Estimate requests and payment verification; do not activate from client redirects.
- Backup history, on-demand encrypted snapshot, integrity verification and restore rehearsal.
- Mobile-friendly owner dashboard, separate from public customer pages.

## Current state
The backup database and empty snapshot table have been provisioned. **No snapshots have been made**; no backup process or restore has been implemented. R2 access returned account error 10042 (R2 not enabled). Do not claim backups are active.

The existing Node.js owner admin endpoints are not ported to Workers. Until authorization and data access are implemented and tested, **do not expose an owner administration API**. Never expose backup payloads publicly.

## Backup safeguards
- Use a unique server-side encryption key managed as a Cloudflare secret.
- Serialize only ProConnect 2.0 `spc2_` tables; never read other tenants or legacy systems.
- Store encrypted payload, checksum, timestamp, and source schema version.
- Verify decrypt + checksum + record comparison before marking verified.
- Set retention and test recovery before enabling recurring automation.
