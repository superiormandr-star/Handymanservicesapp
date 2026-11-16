# Superior ProConnect: PayPal replacement verification

## Outcome

Replacement catalog prepared; subscription integration is **not complete**. All six recurring checkouts and automatic new-package activation remain disabled. No new PayPal subscription links or plan IDs were found in available conversation context, current source, or available Git history. No PayPal products, subscriptions, customer records, or Command Center files were changed.

Prices below are the owner's approved monthly USD prices. They have **not** been verified against PayPal. Essential and Professional are the actual approved names from the owner's price table; older Basic/Pro labels are retired for new public enrollment. Existing records retain legacy IDs and original terms.

| Package | Name | Price (founding / regular monthly) | Complete benefits | Recurring PayPal link | Network placement | Mobile display | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Construction Essential | Pass | Pass: $25 / $39.99 | Fail: complete definition missing | Fail: missing | Pass: Construction section | Pass | Blocked — missing PayPal subscription link |
| Construction Professional | Pass | Pass: $60 / $80 | Fail: complete definition missing | Fail: missing | Pass: Construction section | Pass | Blocked — missing PayPal subscription link |
| Construction Elite | Pass | Pass: $99 / $149 | Fail: definition missing | Fail: missing | Pass: Construction section | Pass | Blocked — missing PayPal subscription link |
| Automotive Essential | Pass | Pass: $25 / $39.99 | Fail: approved tier mapping missing | Fail: missing | Pass: Automotive section | Pass | Blocked — missing PayPal subscription link |
| Automotive Professional | Pass | Pass: $60 / $80 | Fail: approved tier mapping missing | Fail: missing | Pass: Automotive section | Pass | Blocked — missing PayPal subscription link |
| Automotive Elite | Pass | Pass: $99 / $149 | Fail: definition missing | Fail: missing | Pass: Automotive section | Pass | Blocked — missing PayPal subscription link |

Placement is verified in separate network pricing sections of the existing shared homepage. Current `main` does not contain separate Construction and Automotive package pages. No substitute pages or site rebuild were introduced. General Network identity remains separate from the two pricing groups.

## Exact missing package information

- Both Elite packages: approved service description, full benefits, estimate/usage limits, customer eligibility/restrictions, and matching recurring checkout URL and PayPal plan ID. Owner-approved monthly prices are known; no one-time Elite offering is assumed.
- Construction Essential and Professional: prior general directory copy is retained, but complete industry-specific approved descriptions, eligibility/restrictions, and usage limits require verification. Professional's existing "up to 10 AI-assisted estimate drafts per month for review" wording is retained, not newly granted as a paid entitlement.
- Automotive Essential and Professional: the project contains distinct Independent Exposure/Independent Pro and Shop Exposure/Shop Pro definitions. Their features and usage limits are preserved in `network-config.json`, but no approved mapping to the new three-tier catalog exists. Construction features were not copied into these packages.
- All six packages: provider-verified amount/currency, monthly interval, matching network and package, founding-versus-regular eligibility, and recurring checkout URL/plan ID.
- Automatic activation, verified lifecycle events, cancellation, payment failure, renewal, replay/idempotency, and entitlements: not implemented or transaction-tested for the replacements while provider mappings are missing. Frontend callbacks cannot activate the new tiers. No real payment was made.

## Estimate links: distinct from recurring membership

These are the owner-supplied estimate payment links. Public PayPal checkout pages were inspected without submitting payment; both show merchant `Superior proConnect` and no recurring billing wording. They are never assigned to a membership package.

- [Construction Estimate — $18.00 USD](https://www.paypal.com/ncp/payment/ED9BM6N9TVJMC). PayPal item: `Estimate`.
- [Automotive Estimate — $10.00 USD](https://www.paypal.com/ncp/payment/SCXVVGDZU6LE2). PayPal item: `Automotive estimate`.

Each appears under its matching network with explicit text that estimate payment does not activate Essential, Professional, or Elite.

## Validation

- Existing test suite plus new membership safety tests: five tests pass.
- All six matching checkout requests rejected while disabled; cross-network mismatches rejected.
- Forged subscription callbacks rejected for all six new assignments without changing their interest status or subscription references.
- Legacy subscription-reference recording remains covered by the existing regression test; no existing records are migrated or removed.
- Chromium desktop at 1440px and mobile emulation at 390px and 360px: six cards, exact names/prices, correct section placement, disabled recurring controls, no horizontal overflow, no page JavaScript errors.
- Estimate buttons checked separately on desktop/mobile for exact destination and displayed amount. No transaction submitted.
- Approved logo bytes and icon files unchanged by the subscription update. The prior logo deployment was separately verified: three live originals byte-identical to supplied ZIP, live 192/512/180 PNGs correct, Android Chrome emulation and offline logos passed. Physical Android installation has not been tested.

## Before opening subscription enrollment

Obtain the six distinct recurring checkout mappings and complete approved package definitions. Verify each provider plan and founding/regular eligibility. Implement and sandbox-test authenticated server-side payment binding and signature-verified lifecycle handling before enabling purchases or entitlements. Never reuse either estimate link for recurring membership.
