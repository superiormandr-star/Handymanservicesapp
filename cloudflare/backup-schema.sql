-- Separate database: superior-proconnect-2-backups
-- Never execute against Superior Command Center or the main application database.
CREATE TABLE IF NOT EXISTS spc2_backup_snapshots (
 id TEXT PRIMARY KEY,
 created_at TEXT NOT NULL,
 source_database TEXT NOT NULL,
 source_version TEXT NOT NULL,
 checksum_sha256 TEXT NOT NULL,
 payload_encrypted TEXT NOT NULL,
 verification_status TEXT NOT NULL DEFAULT 'pending',
 verified_at TEXT
);
CREATE INDEX IF NOT EXISTS spc2_backup_created ON spc2_backup_snapshots(created_at);
