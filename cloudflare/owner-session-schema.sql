CREATE TABLE IF NOT EXISTS spc2_owner_sessions (
 session_hash TEXT PRIMARY KEY, owner_generation TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS spc2_owner_session_expiry ON spc2_owner_sessions(expires_at);
