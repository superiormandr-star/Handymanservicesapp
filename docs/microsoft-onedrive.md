# Microsoft and OneDrive integration

The existing application has no prior Microsoft OAuth callback. This change defines
the Web callback as `/api/auth/microsoft/callback`. For the existing public origin,
the exact Web redirect URI to register in Entra is:

`https://superior-proconnect.vercel.app/api/auth/microsoft/callback`

Do not register a preview deployment hostname as the production callback. Configure
APP_ORIGIN to the origin that actually runs the backend; the callback must reach
that backend. The existing Vercel production endpoint returned 404 for `/api/health`
during inspection. A READY static deployment does not verify backend availability.
`vercel.json` now routes API requests to the existing Render service at
`https://superior-handyman-services-app.onrender.com`. This does not restart that
service, migrate data, or deploy this branch's new backend code to Render.

## Required private configuration

- MICROSOFT_CLIENT_ID: actual Application (client) ID of the existing Entra app.
- MICROSOFT_TENANT_ID: its actual Directory (tenant) ID (account audience must match).
- MICROSOFT_CLIENT_SECRET: a valid confidential Web application credential.
- APP_ORIGIN: exact HTTPS origin, without a trailing slash.
- BACKUP_ENCRYPTION_KEY: 32 random bytes encoded as 64 hex characters. Keep a secure
  independent copy for recovery. Changing it prevents decryption of older backups.
- ONEDRIVE_STATE_DIR: private persistent directory, outside public assets.
- ONEDRIVE_BACKUP_INTERVAL_MINUTES: 5–10080 minutes; unset disables scheduling.
- ADMIN_TOKEN: existing owner access control; never ship it to public assets.

No credentials were present in Vercel when inspected. This session has no Microsoft
Entra management tool or Microsoft identity credential. Real IDs/secrets must be
supplied through the host's private environment settings, never chat or GitHub.

The owner opens `/backups.html`, unlocks with their owner token, and clicks
**Connect Microsoft account**. This performs a delegated Microsoft authorization
code flow with PKCE and one-use, expiring state. Requested permissions are
`offline_access Files.ReadWrite.AppFolder`. Consent and OneDrive provisioning must
succeed for the actual account. No application-wide Files.ReadWrite.All permission
is requested. The AppFolder permission limits backup access to the app's folder.

## Storage and production release gate

This implementation supports the existing **single persistent Node process**.
OAuth state and refresh tokens are AES-256-GCM encrypted at rest; backup snapshots
are encrypted before Graph upload. Tokens are never returned to the browser.
Automatic scheduling runs only while that process is alive. Backup failure is
logged without exposing tokens. No remote backups are automatically deleted.

**Do not promote this backend to Vercel with local JSON storage.** Vercel does not
provide the persistent disk this application's records and OAuth state require.
Microsoft integration is disabled when VERCEL is set, rather than pretending that
ephemeral token files are durable. OneDrive backup is not a transactional database.
The next production requirement is a durable transactional data/token store and
platform scheduler (or an already available persistent Node backend). Existing live
records must be inventoried and backed up before migration; no existing records
were fetched or migrated by this change. No paid infrastructure was provisioned.

Inspection found the existing Render backend healthy but reporting local file
storage, plus a separate free PostgreSQL instance named
`superior-command-center-data` expiring December 2, 2026. The database's empty
external IP allowlist prevents the hosted read-only query tool from inspecting it.
It has not been repurposed or modified, and may hold Command Center records.

## Recovery

Owner-only backup listing and download are available on `/backups.html`. Recovery
authenticates the encrypted payload, verifies its SHA-256, validates collections,
and downloads JSON. It never overwrites the running application's data. On a
persistent host, stop the app and use the existing `storage-tool.js restore` command
against the downloaded snapshot; it preserves the prior file before replacement.
The recovery JSON contains private customer records and must remain private.

Listing currently shows the first 200 items and reports whether more exist; there
is no automatic retention deletion. Use OneDrive to retrieve older encrypted files
if that limit is reached; do not assume the displayed set is the entire history.
