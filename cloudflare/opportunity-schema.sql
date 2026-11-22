CREATE TABLE IF NOT EXISTS spc2_opportunity_prospects (
 id TEXT PRIMARY KEY, business TEXT NOT NULL, industry TEXT NOT NULL CHECK(industry IN ('construction','automotive','cleaning','other')),
 city TEXT NOT NULL, website TEXT NOT NULL DEFAULT '', source TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('new','contacted','demo_booked','proposal','client','closed')),
 score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100), demo_at TEXT,
 setup_cents INTEGER NOT NULL DEFAULT 0 CHECK(setup_cents>=0), monthly_cents INTEGER NOT NULL DEFAULT 0 CHECK(monthly_cents>=0),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS spc2_opportunity_status ON spc2_opportunity_prospects(status,score);
