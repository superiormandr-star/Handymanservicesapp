-- New empty ProConnect 2.0 tenant. No existing records are imported.
CREATE TABLE IF NOT EXISTS spc_state (
  id TEXT PRIMARY KEY,
  revision BIGINT NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
