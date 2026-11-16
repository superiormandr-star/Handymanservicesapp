# Superior ProConnect — recovered PayPal plan-link inventory (updated 2026-11-15)

These are **owner-supplied URLs**, recovered from chat. This file is a source inventory, **not authorization to activate checkouts**. Preserve all existing accounts, customers and subscriptions.

## Six distinct recurring subscription plan links (now mapped using owner screenshots; billing verification outstanding)

1. https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-38662930HA324233RNL5GVMI
2. https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-2K759018XE8664423NL5GR2I
3. https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-1JG93932CP734950ANL5F2DI
4. https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-1VM79900PL768641SNL5E7KA
5. https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-8HA54058MH7212436NL5EX3Q
6. https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-8WL58047SB8224218NL5GUEI
   - Owner identified this as the **"hundred dollar one"** (approximately $100). This is consistent with the $99 Elite founding price, but exact PayPal amount, billing interval, and **Construction versus Automotive** package have not yet been verified. Do not activate either Elite checkout on this evidence alone.

An earlier pasted message repeated plan 1; subsequently, the owner supplied plan 6 as a sixth distinct URL. https://www.paypal.com/billing/recurring-payment is a PayPal management page, **not** a subscription checkout.

The first five plan URLs were checked and reach PayPal sign-in, which does not publicly expose package name, amount, or billing cycle. Plan 6 is owner-supplied but its checkout details have not yet been independently verified. Do not infer identity from link order or plan ID. One earlier conversation tentatively called plan 5 Construction Essential, but it has NOT been provider-verified.

## Required plan slots and owner-approved prices (USD monthly)

| Network | Tier | Founding | Regular | Verified plan URL |
|---|---|---:|---:|---|
| Construction | Essential | $25 | $39.99 | Missing verification |
| Construction | Professional | $60 | $80 | Missing verification |
| Construction | Elite | $99 | $149 | Missing verification |
| Automotive | Essential | $25 | $39.99 | Missing verification |
| Automotive | Professional | $60 | $80 | Missing verification |
| Automotive | Elite | $99 | $149 | Missing verification |

All six plan URLs were recovered. Subsequent PayPal administration screenshots identify the package mappings below; amount and payment lifecycle verification are still outstanding. Founding versus regular price eligibility must also be verified. Do not assign, enable, or charge based solely on this file.

## Separate owner-approved one-time estimate links (already implemented in network sections)

- Construction estimate $18: https://www.paypal.com/ncp/payment/ED9BM6N9TVJMC
- Automotive estimate $10: https://www.paypal.com/ncp/payment/SCXVVGDZU6LE2

Keep these outside membership cards. They must be placed in their relevant construction/automotive estimate request workflow when that workflow is available. The retired $3.99 general estimate price must not replace $18/$10; note older approved material used $3.99 for **additional AI-assisted estimates**, a distinct potential feature. Do not silently merge these policies.

## Implementation guardrails

- Preserve existing website, request forms, separate construction and automotive services, three approved logos, blue/gold/silver (no orange), customer and payment records, and Superior Command Center.
- Keep each recurring package disabled until exact product, industry, tier, monthly amount, interval, benefits, usage limits, eligibility, and PayPal plan mapping are verified.
- Do not reuse old Handyman Services one-time payment links or either estimate checkout as a subscription.
- Only enable paid membership activation through validated server-side PayPal lifecycle verification, not client-provided IDs.
- Test each link on desktop/mobile and verify cancellation, renewal, failure and approval; mark unverified parts as blocked, not complete.

## Owner screenshot verification — plan mapping (latest)

The owner supplied screenshots from PayPal's subscription administration UI. These identify the following **ON** plans:

| Website tier | PayPal plan ID | Screenshot plan name | PayPal status |
|---|---|---|---|
| Construction Essential | P-8HA54058MH7212436NL5EX3Q | Essential | ON |
| Construction Professional | P-1VM79900PL768641SNL5E7KA | Construction pro | ON |
| Construction Elite | P-1JG93932CP734950ANL5F2DI | Elite (construction-product grouping) | ON |
| Automotive Essential | P-2K759018XE8664423NL5GR2I | Automotive essential | ON |
| Automotive Professional | P-38662930HA324233RNL5GVMI | Automotive pro | ON; screenshot shows $60 per month |
| Automotive Elite | P-8WL58047SB8224218NL5GUEI | Automotive elite | ON |

Note: The same Construction product list also includes additional OFF legacy plans; those were not mapped to new checkout slots. All six links are in `public/subscription-plans.json` with **checkoutEnabled=false**. The screenshot confirms names, grouping and ON status, but does not establish all six plan amounts, founding/regular billing eligibility, working webhooks or server-side entitlement activation. Existing subscriber records were not modified.
