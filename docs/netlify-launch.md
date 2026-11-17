# Superior ProConnect Netlify operations

The migration uses Netlify Functions for the original Node API and the site-wide Netlify Blobs store `superior-proconnect-records`. Netlify's published Credit-based Free plan includes 300 credits per month and its Free plan announcement allows commercial projects. Confirm the account's actual limits and billing before cutover. No add-ons are required by this branch. [Pricing](https://www.netlify.com/pricing/) · [Free plan](https://www.netlify.com/blog/introducing-netlify-free-plan/) · [Functions](https://docs.netlify.com/build/functions/overview/) · [Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)

## Storage and deployment

Use a separate staging project or scope runtime variables to the staging deploy context. Set `SPC_STORAGE_BACKEND=netlify`, a stable `SPC_STORAGE_NAMESPACE` such as `preview-staging`, `APP_ORIGIN` to the exact HTTPS origin, and `ADMIN_TOKEN` and `BACKUP_ENCRYPTION_KEY` as private runtime variables. The encryption key is 32 random bytes encoded as 64 hex characters. Keep staging secrets separate from production. Keep an independent copy of the production encryption key in the owner's password vault. Production uses `SPC_STORAGE_NAMESPACE=production` and `SPC_NETLIFY_CONTEXT=production` scoped to production Functions if the provider does not supply `CONTEXT`.

Initialize the namespace before enabling writes. The owner has confirmed no historical customer or active subscription records. Preserve the Vercel deployment and original Blob storage for rollback. Review any administrative records through the existing authenticated owner export when that access is available. The replacement can start with an empty namespace. Initialization and restore refuse to overwrite existing destination state.

The operator script reads the authorized site ID, personal access token, namespace, and encryption key from a secure environment. The website runtime uses its own Netlify Blob context. The operator token is never needed in the deployed application.

```sh
node scripts/netlify-records.cjs init
node scripts/netlify-records.cjs inventory
node scripts/netlify-records.cjs backup /private/location/proconnect.json.enc
node scripts/netlify-records.cjs verify /private/location/proconnect.json.enc
# Point SPC_STORAGE_NAMESPACE at an empty test namespace for a restore rehearsal.
node scripts/netlify-records.cjs restore /private/location/proconnect.json.enc
```

After initialization and read verification, set `SPC_NETLIFY_DATA_READY=true` and `SPC_PERSISTENCE_VERIFIED=true`. Enable writes with `SPC_WRITES_ENABLED=true` after the namespace is verified. Redeploy and check `/api/health`. The owner-only `/api/admin/inventory` reports counts without exporting records. The authenticated UI shows owner, customer and professional records. Repeat the staging flow across a redeploy and test the destination with its own key and a separately restored archive.

Records are an encrypted, versioned object. Strong reads and conditional writes protect bidding caps and transaction deduplication across instances. JPEG attachments are encrypted separately and served through authorized per-job routes. The portable archive includes the committed records and referenced photos. It verifies ciphertext checksums and decryption and reads back the restored namespace. Save archives outside the hosting account. A restore uses the key that encrypted the archive. A fresh namespace avoids overwriting live data during a restore. Optional OneDrive recovery covers the records snapshot. Use the portable Netlify archive for a complete recovery that includes photos.

## PayPal

Run sandbox checkout only against an isolated namespace and a PayPal sandbox app. Configure its credentials and webhook ID as Functions secrets. Use `PAYPAL_ENVIRONMENT=sandbox` and `PAYPAL_BILLING_ENABLED=true` in that isolated environment. The live adapter operates only in the production namespace. Sandbox and production cannot interchange credentials or plan mappings.

`PAYPAL_PLAN_TERMS_JSON` records the merchant-verified terms per available package. Sandbox entries use distinct sandbox IDs. Live entries use the exact catalog plan IDs. Specify the approved number of estimate credits and the ordered monthly USD cycles. A final cycle has count zero for ongoing monthly billing. Example sandbox configuration:

```json
{
  "construction-essential": {
    "id": "P-SANDBOXEXAMPLE",
    "estimateCredits": 0,
    "cycles": [{"amount": "25.00", "count": 0}]
  }
}
```

The owner-only `GET /api/admin/billing/preflight` checks the configured merchant plan contracts while checkout stays disabled. It does not create subscriptions. Check the six live contracts before accepting live payments. The checkout endpoint checks the selected contract again before approval. Keep live billing disabled while merchant prices, package benefits, or entitlement limits are unresolved. Preserve Automotive Elite's existing catalog values until the merchant amount and any correction are approved.

Register the staging webhook at `/api/paypal/webhook` and subscribe to sale completed, refunded and reversed, plus subscription activated, updated, failed payment, suspended, cancelled and expired. A professional application generates a private access key. The server commits a checkout intent before asking PayPal to create a subscription with that intent as its custom ID. Buyer return only opens the private workspace. Activation requires a signed webhook, matching merchant subscription and successful transaction, or a separately verified hosted subscription binding. The durable ledger records both event and transaction IDs.

All six exact PayPal hosted-plan URLs are retained. An explicitly enabled live hosted option (`PAYPAL_HOSTED_FALLBACK_ENABLED=true`) returns the original URL after provider price verification. The owner associates that hosted payment by confirming payer ownership in the dashboard. The merchant API must also corroborate the approved plan, payer and completed transaction. The two one-time Estimate payment links stay separate. The owner can enable PayPal Reporting API corroboration for matching estimate receipts with `PAYPAL_ESTIMATE_REPORTS_ENABLED=true`. Each receipt can authorize one estimate only.

## Cutover

Verify staging storage, photos, privacy, bid limits, owner access, all policy pages, PWA, and actual sandbox activation, renewal and cancellation before production. Keep the existing Vercel site and its original store available for rollback. Retain the production archive after cutting traffic over. If new records have been accepted on the replacement, reconcile them before any traffic reversal.
