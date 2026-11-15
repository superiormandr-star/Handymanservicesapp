# Superior ProConnect — verified release status

Date: 2026-11-14 UTC

## Existing resources

- Live site: https://superior-proconnect.vercel.app
- Construction: https://superior-proconnect.vercel.app/construction.html
- Automotive: https://superior-proconnect.vercel.app/automotive.html
- Owner workspace: https://superior-proconnect.vercel.app/command-center.html
- Repository: https://github.com/superiormandr-star/Handymanservicesapp
- Existing PR: https://github.com/superiormandr-star/Handymanservicesapp/pull/6
- Working branch: codex/microsoft-onedrive-backups
- Vercel project: superior-proconnect
- Cloudflare Worker: superior-proconnect-storage
- Cloudflare D1 database: superior-proconnect-data

## Verified

- Native Vercel API responds successfully; no dependency on old Render API routing.
- Encrypted persistent Cloudflare storage is active in the production namespace.
- A separate verification namespace passed registration persistence, customer estimate approval, single invoice creation, duplicate prevention and paid-amount persistence.
- Sixteen automated regression tests pass. Payment tests use simulated PayPal responses, not live charges.
- Public pages tested at 320, 390, 768 and 1280px with no horizontal overflow or JavaScript exceptions.
- Original Remodeling asset preserved. Legacy public brand retired; original repository address retained for existing integrations.
- Inline OneDrive controls added to the existing Command Center page; this does not complete integration with the separate existing network-wide Command Center service.
- Personal Microsoft OAuth connection is stored durably. Callback failure reasons are logged without credentials.
- No paid infrastructure, subscription price changes or charges introduced.

## OneDrive remains incomplete

- Original business directory returned: Tenant does not have a SPO license.
- Personal account consent subsequently succeeded.
- Personal drive metadata returned 403 accessDenied; app-folder access and actual encrypted upload returned 404.
- No successful ProConnect OneDrive upload or recovery has been confirmed.
- Matching public report: https://github.com/OneDrive/onedrive-api-docs/issues/1930
- Optional Files.ReadWrite workaround prepared and tested. Default permission remains Files.ReadWrite.AppFolder. Broader permission must be approved by the owner, then separately consented in Microsoft.
- Vercel daily backup cron is configured for 07:17 UTC; configuration is not proof of successful scheduled backups.
- Older main-branch GitHub backup workflow fails because its Microsoft settings are absent. Do not treat its notifications as evidence of a successful backup.

## Other remaining blockers

- PayPal server credentials, webhook ID and approved plan configuration are missing from Vercel. Checkout remains disabled. Connected PayPal plugin does not expose subscription/app configuration tools.
- Original approved ProConnect and Best Wrench Worx images are visible in chat but their original bytes were not accessible in the workspace. They were not recreated or substituted.
- Old Render records have not been migrated or reconciled; old applications and data were not changed. Do not merge blindly: main may automatically redeploy an old Render service using ephemeral records.
- PR #6 remains draft while integration and migration blockers remain.
- Network-wide owner controls are not fully unified.

## Evidence files

- proconnect-mobile.png
- construction-mobile.png
- automotive-mobile.png

No credentials, OAuth codes, access tokens or customer records are included in this report. A proposed local encrypted production export was blocked by automatic approval review and was not created; the owner subsequently directed work to remain focused on OneDrive.
