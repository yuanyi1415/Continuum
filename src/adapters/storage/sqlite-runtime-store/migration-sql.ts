export const RUNTIME_SCHEMA_VERSION = 2;

export const RUNTIME_PRAGMAS = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
`;

export const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS worktree_bindings (
  worktree_id TEXT PRIMARY KEY, work_id TEXT NOT NULL, target_artifact_id TEXT NOT NULL, change_id TEXT,
  work_start_revision TEXT NOT NULL, bound_at TEXT NOT NULL, binding_source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_bindings (
  session_id TEXT NOT NULL, host TEXT NOT NULL, worktree_id TEXT NOT NULL, bound_at TEXT NOT NULL,
  PRIMARY KEY (session_id, host)
);
CREATE TABLE IF NOT EXISTS session_suppressions (
  session_id TEXT NOT NULL, host TEXT NOT NULL, suppressed_at TEXT NOT NULL, reason TEXT,
  PRIMARY KEY (session_id, host)
);
CREATE TABLE IF NOT EXISTS pending_reconciles (
  work_id TEXT PRIMARY KEY, base_revision TEXT NOT NULL, current_revision TEXT NOT NULL, changed_files_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL, knowledge_impact TEXT NOT NULL CHECK (knowledge_impact IN ('N0','N1','N2','N3','N4')),
  actions_json TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pending_interactions (
  interaction_id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('STATUS','NOTICE','DECISION','BLOCK')),
  payload_json TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','resolved','cancelled')),
  created_at TEXT NOT NULL, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS idempotency_keys (key TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS event_cursors (
  host TEXT NOT NULL, session_id TEXT NOT NULL, cursor TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (host, session_id)
);
CREATE TABLE IF NOT EXISTS diagnostic_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, level TEXT NOT NULL, host TEXT,
  event_type TEXT, message TEXT NOT NULL, metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_events_ts ON diagnostic_events(ts);
`;

// P09 introduces the migration framework without adding new Runtime truth. v2 only
// adds lookup indexes used by Doctor/recovery paths.
export const MIGRATION_002 = `
CREATE INDEX IF NOT EXISTS idx_pending_interactions_status_created ON pending_interactions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_pending_reconciles_revision ON pending_reconciles(current_revision);
`;

export const RUNTIME_MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  { version: 1, sql: MIGRATION_001 },
  { version: 2, sql: MIGRATION_002 },
];
