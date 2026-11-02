# Handyman Services — installable website/app

A complete mobile-first, responsive business-directory web application with the blue-and-orange Handyman Services branding, a searchable handyman directory open to service providers across the U.S., Superior Maintenance and Remodeling as the first business profile, PayPal advertiser subscription button, customer ratings and comments, review moderation, business owner replies, phone/text contact, and a progressive web app (PWA) home-screen icon.

## Launch locally

Requires Node.js 20 or newer. There are no external npm dependencies.

```bash
npm start
```

Open `http://localhost:3000` in a browser. On a live HTTPS website, Android Chrome can install it using **⋮ > Add to Home screen** or **Install app**.

## Publish publicly

Deploy the complete folder to a service that supports a persistent Node.js process, such as Replit, Render, Railway or similar. Set the start command to `npm start`, configure the port using the platform's `PORT` environment variable, and attach persistent storage for the data file. The directory will not work correctly on static-only hosting such as GitHub Pages or Netlify Drop.

**Data persistence:** Without persistent disk/database, reviews and advertiser submissions may disappear after a deployment restart. Set `DATA_FILE` to a path on a persistent disk, e.g. `/var/data/handyman.json`, and keep backups.

**Admin access:** Set a long random `ADMIN_TOKEN` environment variable (do **not** place it in website JavaScript). Open `/admin.html` on the deployed site, enter your owner token there, and approve/reject reviews, respond to approved reviews, inspect advertiser applications, and add/edit profiles. The dashboard loads no private data without a correct token. The server-side API also accepts the `X-Admin-Token` header. Never share the token, commit it in the package, or expose it in public client JavaScript.

**Payment verification required before you advertise subscriptions:** The PayPal subscription button uses the client ID and plan ID supplied by the owner. The monthly amount and renewal interval live in PayPal, not in these files. Confirm that PayPal Plan ID `P-53U089831B5370605NLT23EQ` is active and bills exactly **$25 monthly** before sharing the paid signup page. PayPal's approval callback records a subscription reference, but **does not confirm payment, active subscription status, or authorize immediate listing publication**. For automatic activation, set up PayPal server-to-server verification and signed webhook handling. Until then, an administrator must verify the subscription manually before publishing any business profile.

**Reviews:** Customers can submit one-to-five-star reviews, saved as **pending**. The public directory only displays approved reviews. This does not include identity verification or sophisticated fraud detection; add an authenticated review flow, reporting capability, abuse safeguards, email verification and a comprehensive moderation policy before promoting the review system broadly. No fake/example reviews are seeded.

**Provider verification:** Professional licenses, background checks, insurance, and customer testimonials have not been verified. The listing does not claim otherwise.

## Verify the app

Run `npm test`. The automated tests check the public site, PWA files and icons, Superior business profile, pending review workflow, moderation, owner replies, advertiser applications, subscription-reference recording, and retention of the original Superior logo after editing a profile.

## Important production checks

- The website must be hosted with HTTPS and a working Node server to be installable from Android Chrome; this ZIP is not yet publicly deployed.
- Configure server-side persistent storage for reviews and registrations, protect backups, and select an administrator token.
- Confirm the PayPal subscription plan is active and exactly $25 monthly before enabling public paid promotion. The approval callback is **not proof of successful payment**, so listing activation requires manual PayPal verification.
- Public review submissions are stored as pending and become visible only after owner approval. The code does not yet include verified customer identities, anti-fraud detection, or external reputation validation.
- Review privacy/terms and implement production privacy and security safeguards before collecting public customer data.

## Sample admin API calls

Requires `ADMIN_TOKEN` to be configured and `http://localhost:3000` to be running.

```bash
curl -H "X-Admin-Token: $ADMIN_TOKEN" http://localhost:3000/api/admin/pending
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"id":"REVIEW_ID","status":"approved"}' http://localhost:3000/api/admin/review
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"id":"REVIEW_ID","reply":"Thank you for your feedback!"}' http://localhost:3000/api/admin/reply
```

To add an approved business, use the owner console at `/admin.html` (or POST to `/api/admin/profile` with a business name, city, area, description, phone, services, and website). The first business is already seeded as Superior Maintenance and Remodeling.

## Share on Facebook

Publish the app first, open its public HTTPS URL on a separate phone/network, and confirm pages, the service directory, review-submission flow, and PayPal billing details work. Then use the **public URL** for Facebook posts and ads. The app's `og:title` and `og:description` are set; customize an absolute `og:image` URL after deployment for a branded Facebook preview.

## Important status

This folder is a tested application **source package**, not a deployment. Creating the folder does not publish a public link. Publishing and subscription-plan verification are separate steps.

## Render free deployment blueprint (added November 2026)

This package includes `render.yaml` for Render's **Free** Node.js Web Service plan with a generated `ADMIN_TOKEN` and a health check. It simplifies deployment after the source has been pushed to a GitHub or GitLab repository connected to the Render account.

**Important:** The Blueprint does *not* create permanent data storage. Render free web services lose local writes whenever they spin down, restart, or redeploy. As shipped, reviews, owner replies, applications, and PayPal subscription references may be lost. Do not treat free Render as a production database, and do not launch paid Facebook ads or activate subscriptions before a persistent database is integrated. Also verify the PayPal plan's price and interval in PayPal.

If you are setting up a trial, connect the source repository in Render and choose **Blueprint** (or **New > Web Service**, with build `npm install`, start `npm start`, plan **Free**, and a securely configured `ADMIN_TOKEN`). The eventual public address comes from Render once deployment succeeds; it is **not** assigned by this ZIP file.


## Two separate Superior brands

- **Handyman Services** directory/app uses blue-and-orange branding, including the header and orange subscribe button for other service providers.
- **Superior Maintenance and Remodeling**, the featured business in the app, displays the owner's original gold-and-silver logo (with black backdrop). The original PNG is copied byte-for-byte as `public/superior-logo.png`; it is not redrawn, recolored, or replaced.

## Membership section typography update

All previously faint/pale lettering from the $25 membership tier through the signup panel, FAQs, footer, and mobile navigation is now dark blue. These sections use light backgrounds to preserve contrast. $25, billing descriptions, PayPal integration, and the exact original gold-and-silver Superior Maintenance and Remodeling logo are unchanged.

## General U.S. directory branding

The public directory is designed for service providers across the United States. Customers can search current businesses by city, name, and service. Service professionals from across the U.S. can apply; this is not a claim that providers are already listed in every city. The seed company Superior Maintenance and Remodeling remains accurately located in Fontana, California, and uses the *byte-identical original* gold-and-silver business logo. The Superior Handyman Services app branding remains blue and orange. Pricing stays $25/month as the displayed proposed plan, subject to checkout terms.

## Flexible subscriber service territories

During professional subscription intake, each applicant selects **specific cities, counties or ZIP codes**, a **5–150-mile radius from a 5-digit ZIP**, or **one or more entire states**. Inputs are validated, saved with the application, visible to the owner in the application dashboard, and can be copied into the business profile editor with *Prefill listing editor*. The owner reviews payment independently and publishes manually. Public search matches listed text service areas, ZIP anchor, city and service; **the site does not currently calculate distances from a visitor's ZIP or reverse-geocode a radius**. That needs a ZIP geocoding/geospatial dataset and validation before launch. No PayPal payment or publication is triggered by this offline preview.

Hero, section headlines, and footer are national/generic; the seed Superior Maintenance and Remodeling business listing retains its truthful location and original gold-and-silver logo.

Subscribers must also list the actual services they provide; owner dashboard copies submitted services and service areas into the pending listing editor.
