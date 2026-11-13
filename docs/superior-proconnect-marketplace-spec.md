# Superior ProConnect — marketplace implementation specification

Status: approved product requirements; NOT a claim that these features are deployed.

## Product
One installable app, two marketplace sections: Home Services and Automotive Services. Consumers can browse verified service providers or post a job once to solicit competitive estimates. Existing approved portrait/logo artwork must not be altered without owner approval. Proposed umbrella name "Superior ProConnect" remains subject to business-name and trademark clearance.

## Consumer workflows
1. Choose Home Services or Automotive; enter service, location, description, photos, preferred time and optional budget. Never publicly expose personal contact information or exact residential address.
2. Choose either **Competitive quotes** or **Preferred professional**.
3. Competitive: matched, eligible subscribed pros in service area can submit a price or clearly labeled preliminary range, scope, availability, diagnostic/visit fees, and qualifications. Customer receives at most FIVE accepted quotes.
4. Preferred: request is private to selected professional, separate from the five-quote pool. Customer can explicitly switch to competitive quotes if declined or timed out.
5. Consumer privately compares accepted quotes, qualifications, genuine reviews, warranty and availability; chooses or reopens the request. No obligation to select the cheapest.

## Priority within five (owner-approved)
- Industry-specific priority: **Home Services / Construction** prioritizes **Superior Maintenance and Remodeling**; **Automotive Services** prioritizes **Best Wrench Worx**. Each receives first consideration among the FIVE accepted quotes only in its own industry, IF eligible for the trade, geography, licensing and job type AND it has actually submitted a valid quote before selection closes.
- Priority does NOT create a sixth slot, automatically submit a quote, or apply to preferred-pro requests for another business.
- Other eligible quotes fill remaining spots in deterministic submission order. If Superior does not submit, all five slots remain open to other providers.
- To prevent unfair surprise, disclose platform-affiliated placement preference in marketplace and subscriber terms and clearly label affiliated results.
- No fake reviews, fabricated qualification badges or suppression of genuine negative reviews.

## Submission states and notifications
- Quotes start as `submitted_pending_selection`, not represented as delivered.
- Selection commits atomically against a persistent database with transaction/unique constraints; never deliver more than five quotes even under concurrent submissions.
- `delivered`: notify pro "Your estimate was delivered to the customer."
- `not_selected`: notify pro "Five estimates were selected for this job; yours was not delivered." Avoid telling providers an estimate was delivered before the transaction succeeds.
- Set a clear selection window/deadline for priority to be considered, rather than promising first-five immediate delivery then silently replacing a quote.
- Limit one active quote per professional per job, with tracked revisions; reject duplicate submissions and unqualified profiles.

## Professional accounts
- Basic promotional membership: $25/month; searchable listing; no dedicated Pro profile.
- Pro: $79/month; profile, direct contact, eligible job notifications, quote submissions and up to 10 AI-assisted estimate drafts/month for owner review.
- Verify PayPal billing status server-side via signed webhooks or verified API before activating paid privileges; never trust browser callback alone.
- Featured placement requires rating >= 3.0 plus applicable verification and policy compliance; genuine negative reviews remain visible.
- New providers with insufficient review history require a separately labeled provisional verification policy.

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
- 0–5 delivered quotes, never 6 under parallel submissions.
- Eligible Superior Maintenance and Remodeling quote is prioritized among five for construction; eligible Best Wrench Worx quote is prioritized among five for automotive; never a sixth.
- Industry priority business ineligible/no quote -> no special slot; construction and automotive priorities never cross over.
- All selected and rejected professionals receive accurate notices.
- Customers see only delivered quotes; pros cannot view competitors' private quotes.
- Basic/Pro permissions enforced server-side.
- Rejected or unpaid subscriptions never activate.
- Data survives restarts and deployments.
