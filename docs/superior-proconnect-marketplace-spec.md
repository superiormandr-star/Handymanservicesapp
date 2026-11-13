# Superior ProConnect — marketplace implementation specification

Status: approved product requirements; NOT a claim that these features are deployed.

## Product
One installable app, two marketplace sections: Home Services and Automotive Services. Consumers can browse verified service providers or post a job once to solicit competitive estimates. Existing approved portrait/logo artwork must not be altered without owner approval. Proposed umbrella name "Superior ProConnect" remains subject to business-name and trademark clearance.

## Consumer workflows
1. Choose Home Services or Automotive; enter service, location, description, photos, preferred time and optional budget. Never publicly expose personal contact information or exact residential address.
2. Choose either **Competitive quotes** or **Preferred professional**.
3. Competitive: matched, eligible subscribed pros in service area can submit a price or clearly labeled preliminary range, scope, availability, diagnostic/visit fees, and qualifications. Customer chooses a quote limit of 1–5 (default recommended: 3); customer receives no more than their chosen limit.
4. Preferred: request is private to selected professional, separate from the five-quote pool. Customer can explicitly switch to competitive quotes if declined or timed out.
5. Consumer privately compares accepted quotes, qualifications, genuine reviews, warranty and availability; chooses or reopens the request. No obligation to select the cheapest.

## Priority within five (owner-approved)
- Industry-specific priority: **Home Services / Construction** prioritizes **Superior Maintenance and Remodeling**; **Automotive Services** prioritizes **Best Wrench Worx**. Each receives first consideration among the customer-selected 1–5 accepted quotes only in its own industry, IF eligible for the trade, geography, licensing and job type AND it has actually submitted a valid quote before selection closes.
- Priority does NOT create an extra slot, automatically submit a quote, or apply to preferred-pro requests for another business.
- Other eligible quotes fill remaining customer-selected spots in deterministic submission order. If the priority business does not submit, all customer-selected slots remain open to other providers.
- To prevent unfair surprise, disclose platform-affiliated placement preference in marketplace and subscriber terms and clearly label affiliated results.
- No fake reviews, fabricated qualification badges or suppression of genuine negative reviews.

## Customer-selected quote limit
- On competitive job posting, customer chooses 1, 2, 3, 4, or 5 estimates; recommend 3 as default. The chosen limit is immutable once selection begins unless the customer explicitly reopens the request.
- Industry-affiliated priority business counts as ONE of the chosen slots, including when the customer selects only one. Disclose this clearly before customer submits and in professional terms.
- Preferred-pro private requests are outside this competitive limit.

## Submission states and notifications
- Quotes start as `submitted_pending_selection`, not represented as delivered.
- Selection commits atomically against a persistent database with transaction/unique constraints; never deliver more than the customer's selected limit (1–5) even under concurrent submissions.
- `delivered`: notify pro "Your estimate was delivered to the customer."
- `not_selected`: notify pro "The customer's estimate limit was reached; yours was not delivered." Avoid telling providers an estimate was delivered before the transaction succeeds.
- Set a clear selection window/deadline for priority to be considered, rather than promising first-five immediate delivery then silently replacing a quote.
- Limit one active quote per professional per job, with tracked revisions; reject duplicate submissions and unqualified profiles.

## Professional accounts
- Basic promotional membership: **25 for 25** — the first 25 verified, paid Basic subscribers IN EACH CATEGORY (25 Construction + 25 Automotive; 50 total) receive a grandfathered $25/month rate while their qualifying subscription remains continuously active. Later Basic subscribers pay the then-current approved regular price (owner-proposed regular price $39.99/month; display as crossed-out comparison only once genuinely established as the regular price, with truthful promotional terms). Basic primarily accesses a separate, customer-consented lead source and basic listing, not automatic access to the competitive quote pool. Define exact Basic lead-board permissions and lead sourcing before launch.
- Pro: $79/month; profile, direct contact, eligible job notifications, quote submissions and up to 10 AI-assisted estimate drafts/month for owner review.
- Verify PayPal billing status server-side via signed webhooks or verified API before activating paid privileges; never trust browser callback alone.
- Featured placement requires rating >= 3.0 plus applicable verification and policy compliance; genuine negative reviews remain visible.
- New providers with insufficient review history require a separately labeled provisional verification policy.

## Founding-member enrollment safeguards
- Server-side atomic counter/transaction grants no more than 25 founding Basic slots PER CATEGORY (separate counters for Construction and Automotive) after payment is verified; pending or abandoned checkout must not permanently consume a slot. Handle concurrent enrollments and cancellations safely.
- Store immutable founding-member eligibility and original $25 rate; never silently increase grandfathered rates. Terms must define whether a canceled/lapsed account loses the rate, and disclose this before checkout.
- Owner proposes $39.99/month as the regular Basic price and $25/month as the founding rate. A crossed-out $39.99 comparison must not be published until it is a bona fide regular price; verify PayPal plan setup and price presentation. Future price changes remain owner-controlled and require approval before changing billing or promotional copy. Subscription price changes require payment-provider plan handling and applicable advance notice/consent.

## Automation and protections
- Automated matching, notifications, status updates, customer comparison view and audit logs.
- AI drafts only; professionals review and approve binding quotes. Auto-repair estimates may require inspection; construction jobs must respect license and insurance requirements.
- Customer contact consent and communications preferences, anti-spam protections, data retention/deletion, photo access controls and abuse reporting.
- Owner controls for moderation, disputes, account eligibility, priority disclosure, payment verification and monitoring.
- Measure posted jobs, matched pros, delivered quotes, bookings and subscription retention.

## Engineering/deployment gate
Existing repository uses a mutable local JSON file. Do not deploy this as a production paid marketplace to Vercel serverless without replacing file writes with durable transactional storage. Protect existing Cloudflare Superior Command Center deployment. Implement persistent database, authentication/authorization, concurrency-safe quote selection, tests and verified payment flows before enabling real paid enrollment.

## Acceptance tests
- Two industry categories; one account.
- Public competitive request, private preferred-pro request.
- 0–customer-selected limit delivered quotes, never exceeding 1–5 even under parallel submissions.
- Eligible Superior Maintenance and Remodeling quote is prioritized within the customer's selected limit for construction; eligible Best Wrench Worx quote is prioritized within the customer's selected limit for automotive; never an extra quote.
- Industry priority business ineligible/no quote -> no special slot; construction and automotive priorities never cross over.
- All selected and rejected professionals receive accurate notices.
- Customers see only delivered quotes; pros cannot view competitors' private quotes.
- Basic/Pro permissions enforced server-side.
- Rejected or unpaid subscriptions never activate.
- Data survives restarts and deployments.

## Promotional presentation proposal
- Founding membership card: `25 FOR 25`, regular `$39.99/month` struck through (ONLY if established bona fide price), promotional `$25/month`, savings `$14.99/month` (~37.5%), first 25 verified paid Basic members in each category (25 + 25), grandfathered while qualifying subscription remains active.
- Never fabricate a count of remaining spots. Display real verified count only.

## Approved founding category allocation
- **Construction / Home Services**: 25 founding Basic subscriptions at $25/month, independently counted.
- **Automotive Services**: 25 founding Basic subscriptions at $25/month, independently counted.
- **Total**: 50 potential grandfathered founding subscriptions. A filled category does not consume or block the other category's allocation.
- Subscription must be assigned to exactly one category for a founding slot. Cross-category access or dual membership requires a separate explicitly approved rule; do not silently double-count or confer free access.
- At full occupancy, 50 x $25 = $1,250/month gross recurring revenue before fees, churn and expenses; this is not a forecast or guarantee.
