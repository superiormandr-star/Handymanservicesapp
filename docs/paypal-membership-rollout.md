# PayPal membership activation rollout (not live yet)

This branch adds POST /api/paypal/webhook, which verifies incoming PayPal webhook signatures against PayPal's verification API, retrieves the subscription from PayPal, maps the plan ID to one of the six existing Construction/Automotive memberships, and prevents unverified or ambiguous payment events from granting access.

## Required production setup
1. Use the **Superior ProConnect business PayPal account**, not the personal PayPal account. Create or obtain REST API live credentials for the same merchant account as all six subscription plans. Never commit API secrets or paste them into source code.
2. Set production secrets PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID. Leave PAYPAL_ENVIRONMENT unset for live (set it to sandbox only for sandbox tests).
3. Register a PayPal webhook at https://superior-proconnect.vercel.app/api/paypal/webhook and subscribe to PAYMENT.SALE.COMPLETED and BILLING.SUBSCRIPTION.CANCELLED, BILLING.SUBSCRIPTION.SUSPENDED, BILLING.SUBSCRIPTION.EXPIRED. Confirm the hostname routes to a running Node handler, not a static page or 404.
4. **Critical blocker:** the current server persists membership and event history to a local JSON file. Vercel's filesystem is not suitable for persistent multi-instance writes. Integrate with durable transactional database/storage and idempotent unique event IDs before deploying automatic production activation. No webhook should grant memberships until this storage is in place.
5. Match checkout subscriptions to an actual applicant using a reliable, authenticated subscription-to-applicant association. The code currently uses a unique email/plan match as a conservative pilot; missing or ambiguous matches remain pending owner review. A checkout-first customer who did not submit a form cannot be auto-activated.
6. Run unit and integration tests including fake callback rejection, replay, activation following paid event only, ambiguous accounts, cancellations, and failed payments. Do an actual sandbox checkout with a test account and verify membership access; then perform a controlled live test before launching to customers.
7. Keep existing six plan IDs and PayPal plans unchanged. Do not silently count founding spots or change other plan prices.

The public PayPal checkout links are already enabled independently of automatic activation. This branch does not change them. This is **not** confirmation that PayPal credentials/webhook or production database have been configured.
