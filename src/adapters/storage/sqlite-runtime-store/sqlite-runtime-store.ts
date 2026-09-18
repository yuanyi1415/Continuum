import { existsSync, mkdirSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { WorkReconcileCandidate } from "../../../domain/reconcile/work-reconcile.js";
import type { InteractionRequest, InteractionResult } from "../../../domain/interaction/interaction.js";
import type { SessionBinding, SessionSuppression, WorkBinding } from "../../../domain/work/work-binding.js";
import type { RuntimeHealth, RuntimeStorePort } from "../../../ports/runtime-store.js";
import type { RuntimeMigrationResult, RuntimeRecoveryResult } from "../../../ports/maintenance.js";
import { ContinuumError } from "../../../shared/errors/continuum-error.js";
import { RUNTIME_MIGRATIONS, RUNTIME_PRAGMAS, RUNTIME_SCHEMA_VERSION } from "./migration-sql.js";

interface StatementLike { get(...params: unknown[]): any; run(...params: unknown[]): any; all?(...params: unknown[]): any[]; }
interface DatabaseLike { exec(sql: string): void; prepare(sql: string): StatementLike; close(): void; }
const require = createRequire(import.meta.url);

function openDatabase(path: string): { db: DatabaseLike; driver: string } {
  try {
    const mod = require("better-sqlite3") as any;
    const Ctor = mod.default ?? mod;
    return { db: new Ctor(path) as DatabaseLike, driver: "better-sqlite3" };
  } catch (error) {
    if (process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE !== "1") {
      throw new ContinuumError("CONTINUUM_RUNTIME_DRIVER_MISSING", "better-sqlite3 is required for Continuum runtime storage. Run npm install.", true, { cause: String(error) });
    }
    const nodeSqlite = require("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseLike };
    return { db: new nodeSqlite.DatabaseSync(path), driver: "node:sqlite-dev-fallback" };
  }
}

function workBindingFromRow(row: any): WorkBinding {
  return {
    workId: row.work_id,
    worktreeId: row.worktree_id,
    targetArtifactId: row.target_artifact_id,
    changeId: row.change_id ?? undefined,
    workStartRevision: row.work_start_revision,
    boundAt: row.bound_at,
    bindingSource: row.binding_source,
  };
}

function sessionBindingFromRow(row: any): SessionBinding {
  return { sessionId: row.session_id, host: row.host, worktreeId: row.worktree_id, boundAt: row.bound_at };
}

function suppressionFromRow(row: any): SessionSuppression {
  return { sessionId: row.session_id, host: row.host, suppressedAt: row.suppressed_at, reason: row.reason ?? undefined };
}

export class SqliteRuntimeStore implements RuntimeStorePort {
  readonly directory: string;
  readonly path: string;
  constructor(repositoryRoot: string, private readonly nowIso: () => string) {
    this.directory = join(repositoryRoot, ".continuum-local");
    this.path = join(this.directory, "runtime.db");
  }

  private currentVersion(db: DatabaseLike): number {
    try {
      const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
      if (!table) return 0;
      const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version?: number } | undefined;
      return row?.version ?? 0;
    } catch { return 0; }
  }

  async migrate(): Promise<RuntimeMigrationResult> {
    mkdirSync(this.directory, { recursive: true });
    const existed = existsSync(this.path);
    const { db } = openDatabase(this.path);
    try {
      db.exec(RUNTIME_PRAGMAS);
      const fromVersion = existed ? this.currentVersion(db) : 0;
      if (fromVersion > RUNTIME_SCHEMA_VERSION) {
        throw new ContinuumError("CONTINUUM_SCHEMA_TOO_NEW", `runtime.db schema ${fromVersion} is newer than supported ${RUNTIME_SCHEMA_VERSION}.`, false, { schemaVersion: fromVersion, supported: RUNTIME_SCHEMA_VERSION });
      }
      const applied: number[] = [];
      for (const migration of RUNTIME_MIGRATIONS) {
        if (migration.version <= fromVersion) continue;
        try {
          db.exec("BEGIN IMMEDIATE");
          migration.sql.trim() && db.exec(migration.sql);
          // Migration 1 creates schema_migrations itself.
          db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(migration.version, this.nowIso());
          db.exec("COMMIT");
          applied.push(migration.version);
        } catch (error) {
          try { db.exec("ROLLBACK"); } catch {}
          throw error;
        }
      }
      return { fromVersion, toVersion: RUNTIME_SCHEMA_VERSION, applied };
    } finally { db.close(); }
  }

  async initialize(): Promise<void> { await this.migrate(); }

  async health(): Promise<RuntimeHealth> {
    if (!existsSync(this.path)) return { available: false, state: "missing" };
    try {
      const { db, driver } = openDatabase(this.path);
      try {
        db.exec(RUNTIME_PRAGMAS);
        const quick = db.prepare("PRAGMA quick_check").get() as any;
        const quickValue = quick ? Object.values(quick)[0] : "ok";
        if (quickValue !== "ok") return { available: false, state: "corrupt", driver, error: `SQLite quick_check: ${String(quickValue)}` };
        const version = this.currentVersion(db);
        if (version > RUNTIME_SCHEMA_VERSION) return { available: false, state: "too-new", schemaVersion: version, driver, error: `runtime.db schema ${version} is newer than supported ${RUNTIME_SCHEMA_VERSION}.` };
        if (version < RUNTIME_SCHEMA_VERSION) return { available: true, state: "needs-migration", schemaVersion: version, driver };
        return { available: true, state: "healthy", schemaVersion: version, driver };
      } finally { db.close(); }
    } catch (error) {
      if (error instanceof ContinuumError && error.code === "CONTINUUM_RUNTIME_DRIVER_MISSING") return { available: false, state: "unavailable", error: error.message };
      return { available: false, state: "corrupt", error: error instanceof Error ? error.message : String(error) };
    }
  }

  async recover(): Promise<RuntimeRecoveryResult> {
    const health = await this.health();
    if (health.state === "too-new") throw new ContinuumError("CONTINUUM_SCHEMA_TOO_NEW", health.error ?? "runtime.db schema is newer than this CLI.", false, { schemaVersion: health.schemaVersion, supported: RUNTIME_SCHEMA_VERSION });
    if (health.state === "unavailable") throw new ContinuumError("CONTINUUM_RUNTIME_DRIVER_MISSING", health.error ?? "Runtime driver is unavailable.", true);
    if (health.state === "missing") {
      const migration = await this.migrate();
      return { action: "created", schemaVersion: RUNTIME_SCHEMA_VERSION, quarantinedPaths: [], migration };
    }
    if (health.state === "needs-migration") {
      const migration = await this.migrate();
      return { action: migration.applied.length ? "migrated" : "none", schemaVersion: RUNTIME_SCHEMA_VERSION, quarantinedPaths: [], migration };
    }
    if (health.state === "healthy") return { action: "none", schemaVersion: RUNTIME_SCHEMA_VERSION, quarantinedPaths: [] };

    const suffix = `.corrupt-${this.nowIso().replace(/[:.]/g, "-")}`;
    const quarantinedPaths: string[] = [];
    for (const path of [this.path, `${this.path}-wal`, `${this.path}-shm`]) {
      if (!existsSync(path)) continue;
      const target = `${path}${suffix}`;
      renameSync(path, target);
      quarantinedPaths.push(target);
    }
    const migration = await this.migrate();
    return { action: "quarantined-rebuilt", schemaVersion: RUNTIME_SCHEMA_VERSION, quarantinedPaths, migration };
  }

  async getWorktreeBinding(worktreeId: string): Promise<WorkBinding | null> {
    if (!existsSync(this.path)) return null;
    const { db } = openDatabase(this.path);
    try {
      const row = db.prepare("SELECT * FROM worktree_bindings WHERE worktree_id = ?").get(worktreeId);
      return row ? workBindingFromRow(row) : null;
    } finally { db.close(); }
  }

  async listWorktreeBindings(): Promise<WorkBinding[]> {
    if (!existsSync(this.path)) return [];
    const { db } = openDatabase(this.path);
    try {
      const rows = db.prepare("SELECT * FROM worktree_bindings ORDER BY bound_at, worktree_id").all?.() ?? [];
      return rows.map((row: any) => workBindingFromRow(row));
    } finally { db.close(); }
  }

  async bindWork(binding: WorkBinding): Promise<WorkBinding> {
    await this.initialize();
    const { db } = openDatabase(this.path);
    try {
      db.prepare(`INSERT OR IGNORE INTO worktree_bindings(
        worktree_id, work_id, target_artifact_id, change_id, work_start_revision, bound_at, binding_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(binding.worktreeId, binding.workId, binding.targetArtifactId, binding.changeId ?? null, binding.workStartRevision, binding.boundAt, binding.bindingSource);
      const row = db.prepare("SELECT * FROM worktree_bindings WHERE worktree_id = ?").get(binding.worktreeId);
      if (!row) throw new ContinuumError("CONTINUUM_RUNTIME_CORRUPT", "Work binding could not be persisted.");
      return workBindingFromRow(row);
    } finally { db.close(); }
  }

  async clearWorktreeBinding(worktreeId: string): Promise<void> {
    if (!existsSync(this.path)) return;
    const { db } = openDatabase(this.path);
    try { db.prepare("DELETE FROM worktree_bindings WHERE worktree_id = ?").run(worktreeId); }
    finally { db.close(); }
  }

  async clearSessionBindingsForWorktree(worktreeId: string): Promise<void> {
    if (!existsSync(this.path)) return;
    const { db } = openDatabase(this.path);
    try { db.prepare("DELETE FROM session_bindings WHERE worktree_id = ?").run(worktreeId); }
    finally { db.close(); }
  }

  async getSessionBinding(sessionId: string, host: string): Promise<SessionBinding | null> {
    if (!existsSync(this.path)) return null;
    const { db } = openDatabase(this.path);
    try {
      const row = db.prepare("SELECT * FROM session_bindings WHERE session_id = ? AND host = ?").get(sessionId, host);
      return row ? sessionBindingFromRow(row) : null;
    } finally { db.close(); }
  }

  async bindSession(binding: SessionBinding): Promise<void> {
    await this.initialize();
    const { db } = openDatabase(this.path);
    try {
      db.prepare(`INSERT INTO session_bindings(session_id, host, worktree_id, bound_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id, host) DO UPDATE SET worktree_id = excluded.worktree_id, bound_at = excluded.bound_at`)
        .run(binding.sessionId, binding.host, binding.worktreeId, binding.boundAt);
    } finally { db.close(); }
  }

  async suppressSession(suppression: SessionSuppression): Promise<void> {
    await this.initialize();
    const { db } = openDatabase(this.path);
    try {
      db.prepare(`INSERT INTO session_suppressions(session_id, host, suppressed_at, reason)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id, host) DO UPDATE SET suppressed_at = excluded.suppressed_at, reason = excluded.reason`)
        .run(suppression.sessionId, suppression.host, suppression.suppressedAt, suppression.reason ?? null);
    } finally { db.close(); }
  }

  async isSessionSuppressed(sessionId: string, host: string): Promise<boolean> {
    return (await this.getSessionSuppression(sessionId, host)) !== null;
  }

  async getSessionSuppression(sessionId: string, host: string): Promise<SessionSuppression | null> {
    if (!existsSync(this.path)) return null;
    const { db } = openDatabase(this.path);
    try {
      const row = db.prepare("SELECT * FROM session_suppressions WHERE session_id = ? AND host = ?").get(sessionId, host);
      return row ? suppressionFromRow(row) : null;
    } finally { db.close(); }
  }

  private pendingFromRow(row: any): WorkReconcileCandidate {
    return {
      workId: row.work_id,
      baseRevision: row.base_revision,
      currentRevision: row.current_revision,
      changedFiles: JSON.parse(row.changed_files_json),
      evidence: JSON.parse(row.evidence_json),
      knowledgeImpact: row.knowledge_impact,
      actions: JSON.parse(row.actions_json),
      updatedAt: row.updated_at,
    } as WorkReconcileCandidate;
  }

  async loadPendingReconcile(workId: string): Promise<WorkReconcileCandidate | null> {
    if (!existsSync(this.path)) return null;
    const { db } = openDatabase(this.path);
    try {
      const row = db.prepare("SELECT * FROM pending_reconciles WHERE work_id = ?").get(workId) as any;
      return row ? this.pendingFromRow(row) : null;
    } finally { db.close(); }
  }

  async listPendingReconciles(): Promise<WorkReconcileCandidate[]> {
    if (!existsSync(this.path)) return [];
    const { db } = openDatabase(this.path);
    try {
      const rows = db.prepare("SELECT * FROM pending_reconciles ORDER BY updated_at, work_id").all?.() ?? [];
      return rows.map((row: any) => this.pendingFromRow(row));
    } finally { db.close(); }
  }

  async savePendingReconcile(candidate: WorkReconcileCandidate): Promise<void> {
    await this.initialize();
    const { db } = openDatabase(this.path);
    try {
      db.prepare(`INSERT INTO pending_reconciles(
        work_id, base_revision, current_revision, changed_files_json, evidence_json, knowledge_impact, actions_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(work_id) DO UPDATE SET
        base_revision = excluded.base_revision,
        current_revision = excluded.current_revision,
        changed_files_json = excluded.changed_files_json,
        evidence_json = excluded.evidence_json,
        knowledge_impact = excluded.knowledge_impact,
        actions_json = excluded.actions_json,
        updated_at = excluded.updated_at`)
        .run(
          candidate.workId, candidate.baseRevision, candidate.currentRevision,
          JSON.stringify(candidate.changedFiles), JSON.stringify(candidate.evidence), candidate.knowledgeImpact,
          JSON.stringify(candidate.actions), candidate.updatedAt,
        );
    } finally { db.close(); }
  }

  async deletePendingReconcile(workId: string): Promise<void> {
    if (!existsSync(this.path)) return;
    const { db } = openDatabase(this.path);
    try { db.prepare("DELETE FROM pending_reconciles WHERE work_id = ?").run(workId); }
    finally { db.close(); }
  }

  async savePendingInteraction(request: InteractionRequest): Promise<void> {
    await this.initialize();
    const { db } = openDatabase(this.path);
    try {
      db.prepare(`INSERT INTO pending_interactions(interaction_id, type, payload_json, status, created_at, resolved_at)
        VALUES (?, ?, ?, 'pending', ?, NULL)
        ON CONFLICT(interaction_id) DO UPDATE SET type = excluded.type, payload_json = excluded.payload_json, status = 'pending', created_at = excluded.created_at, resolved_at = NULL`)
        .run(request.id, request.type, JSON.stringify(request), request.createdAt);
    } finally { db.close(); }
  }

  async loadPendingInteraction(interactionId: string): Promise<InteractionRequest | null> {
    if (!existsSync(this.path)) return null;
    const { db } = openDatabase(this.path);
    try {
      const row = db.prepare("SELECT payload_json FROM pending_interactions WHERE interaction_id = ? AND status = 'pending'").get(interactionId) as any;
      return row ? JSON.parse(row.payload_json) as InteractionRequest : null;
    } finally { db.close(); }
  }

  async listPendingInteractions(): Promise<InteractionRequest[]> {
    if (!existsSync(this.path)) return [];
    const { db } = openDatabase(this.path);
    try {
      const rows = db.prepare("SELECT payload_json FROM pending_interactions WHERE status = 'pending' ORDER BY created_at, interaction_id").all?.() ?? [];
      return rows.map((row: any) => JSON.parse(row.payload_json) as InteractionRequest);
    } finally { db.close(); }
  }

  async resolveInteraction(result: InteractionResult): Promise<void> {
    if (!existsSync(this.path)) return;
    const { db } = openDatabase(this.path);
    try {
      db.prepare("UPDATE pending_interactions SET status = ?, resolved_at = ? WHERE interaction_id = ? AND status = 'pending'")
        .run(result.action === "cancel" ? "cancelled" : "resolved", result.resolvedAt, result.requestId);
    } finally { db.close(); }
  }

  async hasIdempotencyKey(key: string): Promise<boolean> {
    if (!existsSync(this.path)) return false;
    const { db } = openDatabase(this.path);
    try { return Boolean(db.prepare("SELECT 1 AS ok FROM idempotency_keys WHERE key = ?").get(key)); }
    finally { db.close(); }
  }

  async saveIdempotencyKey(key: string, createdAt: string): Promise<void> {
    await this.initialize();
    const { db } = openDatabase(this.path);
    try { db.prepare("INSERT OR IGNORE INTO idempotency_keys(key, created_at) VALUES (?, ?)").run(key, createdAt); }
    finally { db.close(); }
  }
}
