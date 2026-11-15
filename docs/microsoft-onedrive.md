# Microsoft OneDrive backups

The exact callback is:
`https://superior-proconnect.vercel.app/api/auth/microsoft/callback`.

The current Microsoft client secret was accepted in an actual isolated Microsoft
credential check (HTTP 200). This proves credential acceptance only, not account
consent or OneDrive access. The lowercase `microsoft_client_secret` environment key
is supported. Secret values must never be pasted into chat or source control.

## Persistent backend

The native Vercel API now supports a separate signed, encrypted ProConnect storage
service. It does not proxy to or restart the old Render application. Production
requests fail closed until that storage service is deployed and its URL configured.
No missing/corrupt state is silently replaced. Local Node development still supports
the original file-based store.

The proposed storage service keeps records and OAuth tokens encrypted in its own
D1 database. The Cloudflare Worker has only the signing public key and ciphertext;
it cannot decrypt customer records. The existing Command Center database and its
Microsoft connection are separate and unchanged. Deploying the new service through
Fieldnotes' existing Cloudflare authorization requires the owner's scoped approval.

## Authorization and backups

Owner-only `/backups.html` initiates the delegated authorization-code flow, with
PKCE, expiring state and `offline_access Files.ReadWrite.AppFolder`. Owner Microsoft
sign-in/consent is still required. No working OneDrive connection is implied merely
by the presence of credentials.

Backups use AES-256-GCM encryption before upload. Uploaded bytes are downloaded
again and their SHA-256 must match before success is reported. Recovery downloads
authenticate, decrypt and validate record collections; they never replace live data.
Keep the encryption key recoverable through a private owner-controlled secret store.

On Vercel, `/api/cron/backup` is called daily and requires `CRON_SECRET`. The optional
GitHub daily workflow independently exports actual private records, uploads an
encrypted snapshot, downloads it, and verifies decrypted recovery. It reports
failure when required credentials are missing rather than uploading a dummy object
and calling it a customer-record backup.

See [launch-status.md](launch-status.md) for required private settings and remaining
production release gates. Actual ProConnect consent, upload and recovery remain
blocked until the persistent service and owner consent are completed.
