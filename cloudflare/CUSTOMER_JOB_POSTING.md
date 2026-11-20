# Superior ProConnect 2.0 — Customer Job Posting

The existing `public/index.html` already contains `#customer-job-form`, with fields for network (Construction or Automotive), 1–3 estimates, job title, category, city/general area, job description/measurements, private name/email/phone/address, consent, and rules acceptance. It also has `#job-files` accepting JPG, PNG, and PDF, currently labeled up to 3 files of 256 KB each.

**Deployment caveat:** The current Cloudflare Worker serves the frontend but most `/api/*` routes still return 503. A visible form is NOT a working job-submission service.

## Completion criteria
1. Authenticated customer registration, sign-in, and recovery without exposing private access keys.
2. Persist validated job details and private customer data in `spc2_` D1 tables; protect contact details and addresses with authorization checks.
3. Persist attachment bytes in a private object store (not D1 metadata only), with size/type validation, random object keys, malware precautions, and authenticated download.
4. Enforce estimate limits atomically on the server; fourth estimate requires explicit customer authorization.
5. Show each job in the separate ProConnect 2.0 owner Command Center; eligible professionals see only general job information until approval.
6. Confirm a job submission survives reload and deployment, and that attachments can be downloaded by their authorized owner.
7. Back up jobs, customers, estimates and attachment metadata with encrypted, restore-tested snapshots; back up attachment objects separately.

Never point this workflow to the original Superior Command Center or legacy ProConnect data.
