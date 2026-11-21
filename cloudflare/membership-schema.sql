-- Superior ProConnect isolated membership backend. Apply ONLY to superior-proconnect-data D1.
-- Additive: no existing tables or customer records are dropped or replaced.
CREATE TABLE IF NOT EXISTS spc2_applications (
 id TEXT PRIMARY KEY,
 business TEXT NOT NULL,
 email TEXT NOT NULL,
 city TEXT NOT NULL,
 phone TEXT NOT NULL DEFAULT '',
 industry TEXT NOT NULL CHECK(industry IN ('construction','automotive')),
 tier TEXT NOT NULL CHECK(tier IN ('essential','professional','elite')),
 services_json TEXT NOT NULL,
 coverage_mode TEXT NOT NULL,
 coverage_json TEXT NOT NULL,
 paypal_subscription_id TEXT UNIQUE,
 payment_status TEXT NOT NULL DEFAULT 'awaiting_paypal',
 status TEXT NOT NULL DEFAULT 'pending',
 access_hash TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS spc2_applications_status_idx ON spc2_applications(status,created_at);
CREATE TABLE IF NOT EXISTS spc2_membership_webhook_events (
 id TEXT PRIMARY KEY,
 subscription_id TEXT NOT NULL,
 event_type TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS spc2_webhook_sub_idx ON spc2_membership_webhook_events(subscription_id,created_at);
