# Superior ProConnect 2.0 Cloudflare migration

Status: NOT READY FOR PUBLIC LAUNCH. This branch provides Cloudflare Workers static assets routing and a separate existing D1 binding. The existing Node HTTP API has NOT been ported. All API writes deliberately return HTTP 503 to avoid silently losing customer records. No checkout activation should occur until server-side PayPal verification and persistence tests pass.

Deployment requires an authenticated Cloudflare Workers deploy of this branch. This is not a production launch.

Required next steps:
1. Port the existing customer, job, estimate, CRM, owner and membership routes to Workers request/response APIs while preserving authorization and privacy.
2. Design and apply D1 schema migrations, ensuring no existing tables or records are destroyed.
3. Verify create/read/update after redeployment and test customer estimate cap and private contact masking.
4. Verify all six PayPal plan amounts and billing intervals and implement authenticated payment lifecycle/webhook processing.
5. End-to-end test estimate, approval, invoice and persistence plus mobile behavior.
6. Only after those tests, switch traffic to Cloudflare and remove dependence on the old host.
