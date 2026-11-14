# ProConnect backend release status

This branch adds a native Vercel API entry point. It never proxies requests to the
old Superior Maintenance and Remodeling Render deployment. Existing Render services
and Command Center records remain untouched.

## Persistent storage

The proposed separate Cloudflare service stores AES-256-GCM ciphertext in a dedicated
ProConnect D1 database. Requests are signed with Ed25519; the Worker has only the
public key. Revision checks reject stale writes, and previous encrypted revisions
are retained. No plaintext customer records or OAuth tokens reach the storage service.
The API fails closed if storage is missing, corrupt, or unavailable. It does not
fall back to Vercel's ephemeral filesystem. Local development retains the existing
file-based mode. Production and preview namespaces are separate.

Deployment requires owner approval to use the separate Fieldnotes repository's
Cloudflare environment for this narrowly scoped new service. The metadata-only check
was approved and passed. No storage resource has been deployed at the time of this
note. The deployment script refuses to provision when account subscriptions exist.

Private Vercel settings required: SPC_STORAGE_URL, SPC_STORAGE_PRIVATE_KEY,
BACKUP_ENCRYPTION_KEY, ADMIN_TOKEN, CRON_SECRET. SPC_ALLOW_INITIALIZE must explicitly
permit initial creation; an existing state is never reset. Import/migration of any
private records from the old Render service must be done from an owner-exported
backup; no private legacy records have been fetched, overwritten, or deleted.

## PayPal

Checkout stays disabled by default. Required private settings: PAYPAL_CLIENT_ID,
PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_ENVIRONMENT, and PAYPAL_PLANS_JSON.
PAYPAL_PLANS_JSON maps `industry:membership` to the actual existing PayPal plan ID,
unchanged approved amount as a decimal string, and USD currency. No plan IDs or
prices should be guessed, and no plans are created by this implementation.

Set PAYPAL_CHECKOUT_ENABLED=true only after actual plan verification and authorized
sandbox/live validation. The webhook URL is
https://superior-proconnect.vercel.app/api/paypal/webhook.
Webhook signatures are verified through PayPal. A browser callback, application
status, or PayPal approval URL alone never activates paid privileges. Activation
requires an ACTIVE subscription bound by custom_id to the original application,
matching the exact approved plan and payment amount/currency. Overridden plans and
quantities other than one are rejected. Cancellation removes paid privileges.
Events are deduplicated. A business listing still requires owner publication.

No real PayPal server credentials or approved plan map were configured when checked;
remote PayPal calls in automated tests are simulated. No real charge has been made.

## OneDrive

Microsoft accepted the currently configured client secret in a real isolated
credential test (HTTP 200). That does not prove delegated OneDrive consent.
The callback is https://superior-proconnect.vercel.app/api/auth/microsoft/callback.
The existing lowercase microsoft_client_secret is supported without renaming.

With persistent storage configured, encrypted OAuth tokens are stored through the
same signed storage service. The owner initiates consent at /backups.html. Uploads
are encrypted and then downloaded again; a matching checksum is required before
success is reported. Recovery downloads authenticate/decrypt and validate collections;
they do not overwrite live records. Vercel's daily cron calls the authenticated
/api/cron/backup route. Secrets and customer records must never appear in logs.

ProConnect's actual consent, upload, and recovery remain unverified until the storage
service is deployed and the owner authorizes Microsoft. Command Center's separate
OneDrive connection was checked independently and is not a ProConnect backup.

## Validation

The automated suite includes existing directory/CRM/document flows, local recovery,
PayPal verification/rejection cases, OneDrive encryption/recovery, and actual SQLite
CAS/history operations with real Ed25519/AES-GCM cryptography. Production checks
must additionally exercise the deployed service and actual provider responses.

## Latest checks

All 13 automated tests pass, including HTTP payment routes with a simulated PayPal
service and encrypted upload/download/recovery corruption checks. Chromium checks
passed for 320/390/768/1280 widths, category navigation, filtering, signup selection,
and network footers. The Handyman Services category uses the existing original
handyman-logo.png unchanged; the Remodeling logo is also unchanged.

The native API preview responds explicitly with HTTP 503 while persistent storage
is unconfigured. This is not a functioning production record service yet. Payment
provider calls in tests are simulated; no real charge was created or verified.
