# SUPERIOR PROCONNECT 2.0 — PROJECT ISOLATION

This branch belongs exclusively to **Superior ProConnect 2.0**.

## Ownership and separation
- GitHub: `superiormandr-star/Handymanservicesapp`, branch `superior-proconnect-2-workers-production`.
- Cloudflare Worker: `superior-proconnect-2`.
- Cloudflare D1 database: `superior-proconnect-data`. New tables use the `spc2_` prefix.
- Approved logo originals: `public/logos/Superior_ProConnect_Master.jpg`, `public/logos/Superior_Construction_Network.jpg`, and `public/logos/Superior_Automotive_Network.jpg`.
- Construction, Automotive and Network remain separate sections inside this application.
- Payment configuration belongs only to this app and must be verified before checkout is enabled.

## Never modify or merge
- Cloudflare Worker `superior-command-center` or D1 database `superior-command-center`.
- Original ProConnect production app or its storage Worker `superior-proconnect-storage`.
- Superior Remodeling public website or other business sites.
- Legacy Handyman Services application branches or assets.

## Deployment guardrails
- Deploy only to the `superior-proconnect-2` Worker.
- Preserve all existing D1 records and tables. Use additive migrations for `spc2_` tables.
- Do not enable payments or customer submissions before server-side persistence, authorization, and PayPal verification pass.
- Preserve approved blue, silver and gold branding; no recoloring or redesign.
