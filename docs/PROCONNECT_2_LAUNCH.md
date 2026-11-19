# Superior ProConnect 2.0 — fresh production-track build

**Status:** GitHub source branch only; a public live deployment requires a connected commercial host. No service or subscription charge is authorized by this repository.

## Fresh start
Deploy on a new, independent Railway service. Do not transfer the prior Vercel Blob data, customer records, membership subscriptions, access keys, estimates or invoices. The new application initializes an empty customer/review/job/membership/document dataset with the existing Superior Maintenance and Remodeling example directory profile. Original production remains unchanged.

## Features and artwork retained
The complete Node.js backend, customer job posting and quote selection, professional workspaces, construction and automotive networks, owner administration, job bidding, estimates and invoices, legal pages, and mobile installable website are inherited from the original code. The three **exact approved binary logo files** are unchanged:
- `public/logos/Superior_ProConnect_Master.jpg`
- `public/logos/Superior_Construction_Network.jpg`
- `public/logos/Superior_Automotive_Network.jpg`

## Hosting
GitHub is the source repository and deployment trigger. Do not use GitHub Pages, which does not host the Node server. Connect a separate Railway service to this repository on branch `superior-proconnect-2-railway` and deploy via the root Dockerfile and `railway.json`. Confirm Railway plan supports the intended commercial usage, service availability, persistent volumes, and approved monthly costs before enabling any paid plan.

**Required:** Attach a persistent Railway volume at `/data`; configure `DATA_FILE=/data/proconnect.json`, `NODE_ENV=production`, and a fresh secret `ADMIN_TOKEN` of at least 32 characters. The service refuses to start without the expected mounted volume and secret. Do not scale horizontally while using the single JSON file. Never commit live secrets to GitHub.

Check the public `/api/health`, all three exact logo URLs, `/terms.html`, `/privacy.html`, `/standards.html`, owner/pro/customer flows, restart durability, and mobile PWA. Configure encrypted offsite backups with a restore test before storing real customer data. A mounted volume alone is not a backup.

## PayPal safeguards
The six owner-supplied subscription links and two separate estimate payment links remain in the original subscription catalog and website, with no new prices invented. The catalog currently says `checkoutEnabled=true` and `activationEnabled=false`; do **not** represent checkout as automatic activation. Verify each live PayPal checkout's tier, amount, interval, terms, cancellation, and payment confirmation before paid launch. Never grant a membership based only on a client redirect or unverified token.

## Important
Do not merge this branch into `main` or redirect the existing ProConnect production URL until the independent replacement is working and authorized.
