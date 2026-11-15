CREATE TABLE IF NOT EXISTS spc_state (
 namespace TEXT PRIMARY KEY,
 revision INTEGER NOT NULL CHECK(revision>0),
 payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS spc_history (
 namespace TEXT NOT NULL,
 revision INTEGER NOT NULL,
 payload TEXT NOT NULL,
 PRIMARY KEY(namespace,revision)
);
