-- Superior ProConnect 2.0 isolated tables; no existing tables modified.
CREATE TABLE IF NOT EXISTS spc2_jobs (
 id TEXT PRIMARY KEY,
 industry TEXT NOT NULL CHECK(industry IN ('construction','automotive')),
 title TEXT NOT NULL,
 description TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL,
 customer_private TEXT NOT NULL,
 customer_key_hash TEXT NOT NULL,
 bid_limit INTEGER NOT NULL CHECK(bid_limit BETWEEN 1 AND 3),
 status TEXT NOT NULL DEFAULT 'open',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS spc2_jobs_industry_status ON spc2_jobs(industry,status,created_at);
CREATE TABLE IF NOT EXISTS spc2_bids (
 id TEXT PRIMARY KEY,
 job_id TEXT NOT NULL REFERENCES spc2_jobs(id),
 professional_id TEXT NOT NULL,
 status TEXT NOT NULL,
 created_at TEXT NOT NULL,
 verified_at TEXT,
 UNIQUE(job_id,professional_id)
);
CREATE INDEX IF NOT EXISTS spc2_bids_job_status ON spc2_bids(job_id,status);
CREATE TABLE IF NOT EXISTS spc2_memberships (
 id TEXT PRIMARY KEY,
 professional_id TEXT NOT NULL,
 industry TEXT NOT NULL,
 tier TEXT NOT NULL,
 paypal_subscription_id TEXT UNIQUE,
 payment_verified INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL
);
