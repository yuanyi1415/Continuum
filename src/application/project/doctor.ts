import type { ArtifactAuthorityPort } from "../../ports/artifact-authority.js";
import type { GitPort } from "../../ports/git.js";
import type { DurableMaintenancePort, HostDiagnosticsPort, RuntimeRecoveryResult } from "../../ports/maintenance.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
import type { ReconcileWork } from "../reconcile/reconcile-work.js";
import { isContinuumInternalPath } from "../../domain/reconcile/work-reconcile.js";

export type CheckLevel = "PASS" | "WARN" | "FAIL";
export interface DoctorCheck {
  name: string;
  level: CheckLevel;
  message: string;
  code?: string;
  recoverable?: boolean;
  repaired?: boolean;
  details?: Record<string, unknown>;
}
export interface DoctorResult {
  ok: boolean;
  recovered: boolean;
  checks: DoctorCheck[];
}
export interface DoctorOptions { recover?: boolean; }

export class Doctor {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root: string) => ProjectStorePort,
    private readonly runtimeFactory: (root: string) => RuntimeStorePort,
    private readonly durableFactory: (root: string) => DurableMaintenancePort,
    private readonly authorityFactory: (root: string) => ArtifactAuthorityPort,
    private readonly hostFactory: (root: string) => HostDiagnosticsPort,
    private readonly reconcileWork: ReconcileWork,
  ) {}

  async execute(cwd: string, options: DoctorOptions = {}): Promise<DoctorResult> {
    const checks: DoctorCheck[] = [];
    let recovered = false;
    let facts: Awaited<ReturnType<GitPort["inspect"]>>;
    try {
      facts = await this.git.inspect(cwd);
      checks.push({ name: "git", level: "PASS", message: `Git repository: ${facts.root}` });
    } catch (error) {
      return { ok: false, recovered: false, checks: [{ name: "git", level: "FAIL", code: "CONTINUUM_GIT_UNAVAILABLE", message: error instanceof Error ? error.message : String(error) }] };
    }

    const root = facts.root;
    const durableInspection = await this.durableFactory(root).inspect();
    if (durableInspection.hasTooNewSchema) {
      const bad = durableInspection.files.filter(file => file.schemaVersion !== undefined && file.schemaVersion > durableInspection.currentVersion);
      checks.push({ name: "durable-schema", level: "FAIL", code: "CONTINUUM_SCHEMA_TOO_NEW", message: `Durable schema is newer than this CLI in ${bad.length} file(s); refusing to guess or rewrite.`, details: { files: bad.map(file => file.path) } });
    } else if (durableInspection.hasInvalidSchema) {
      const bad = durableInspection.files.filter(file => file.level === "FAIL");
      checks.push({ name: "durable-schema", level: "FAIL", code: "CONTINUUM_SCHEMA_INVALID", message: `Durable schema is invalid in ${bad.length} file(s).`, details: { files: bad.map(file => ({ path: file.path, message: file.message })) } });
    } else if (durableInspection.hasOlderSchema) {
      const old = durableInspection.files.filter(file => file.schemaVersion !== undefined && file.schemaVersion < durableInspection.currentVersion);
      checks.push({ name: "durable-schema", level: "FAIL", code: "CONTINUUM_SCHEMA_INVALID", recoverable: true, message: `Durable schema migration is required for ${old.length} file(s). Run continuum migrate.`, details: { files: old.map(file => file.path), targetVersion: durableInspection.currentVersion } });
    } else {
      checks.push({ name: "durable-schema", level: "PASS", message: `Durable schema v${durableInspection.currentVersion} is valid.` });
    }

    const durableUsable = !durableInspection.hasTooNewSchema && !durableInspection.hasInvalidSchema && !durableInspection.hasOlderSchema;
    let baselineRevision: string | undefined;
    let store: ProjectStorePort | undefined;
    if (durableUsable) {
      store = this.storeFactory(root);
      try {
        const project = await store.loadProject();
        const current = await store.loadCurrent();
        let snapshot;
        try { snapshot = await store.loadSnapshot(current.snapshotId); }
        catch (error) {
          checks.push({ name: "current-pointer", level: "FAIL", code: "CONTINUUM_PROJECT_NOT_FOUND", recoverable: false, message: `Current points to missing or unreadable Snapshot ${current.snapshotId}; Continuum will not guess another Snapshot. ${error instanceof Error ? error.message : String(error)}` });
          snapshot = undefined;
        }
        if (snapshot) {
          baselineRevision = (snapshot.baselines.find(b => b.repositoryIdentity === project.repository.identity) ?? snapshot.baselines[0])?.revision;
          checks.push({ name: "current-pointer", level: "PASS", message: `Current Snapshot ${current.snapshotId} exists.` });
        }
        const identityMatches = project.repository.identity.startsWith("git-local:")
          ? project.repository.identity === `git-local:${facts.rootRevision}`
          : project.repository.identity === facts.repositoryIdentity;
        checks.push(identityMatches
          ? { name: "repository-identity", level: "PASS", message: `Repository identity matches ${project.repository.identity}` }
          : { name: "repository-identity", level: "FAIL", code: "CONTINUUM_AUTHORITY_UNAVAILABLE", message: `Repository identity mismatch: expected ${project.repository.identity}, observed ${facts.repositoryIdentity}` });

        const changes = await store.listChanges();
        const artifacts = await store.listArtifacts();
        const relations = await store.listRelations();
        const artifactIds = new Set(artifacts.map(artifact => artifact.artifactId));
        const changeIds = new Set(changes.map(change => change.changeId));
        const missingChangeRefs: Array<{ changeId: string; artifactId: string }> = [];
        for (const change of changes) for (const ref of [...change.specRefs, ...change.ticketRefs]) if (!artifactIds.has(ref)) missingChangeRefs.push({ changeId: change.changeId, artifactId: ref });
        const orphanRelations = relations.filter(relation => !(artifactIds.has(relation.from) || changeIds.has(relation.from)) || !(artifactIds.has(relation.to) || changeIds.has(relation.to)));
        if (missingChangeRefs.length || orphanRelations.length) {
          checks.push({ name: "artifact-graph", level: "FAIL", code: "CONTINUUM_AUTHORITY_UNAVAILABLE", message: `Artifact graph contains ${missingChangeRefs.length} missing Change ref(s) and ${orphanRelations.length} orphan Relation(s).`, details: { missingChangeRefs, orphanRelations: orphanRelations.map(r => r.relationId) } });
        } else checks.push({ name: "artifact-graph", level: "PASS", message: `Artifact graph references are complete (${artifacts.length} artifacts, ${relations.length} relations).` });

        const authority = this.authorityFactory(root);
        const missingAuthority: Array<{ artifactId: string; locator: string; authority: string; error?: string }> = [];
        for (const artifact of artifacts) {
          try { if (!(await authority.exists(artifact))) missingAuthority.push({ artifactId: artifact.artifactId, locator: artifact.locator, authority: artifact.authority }); }
          catch (error) { missingAuthority.push({ artifactId: artifact.artifactId, locator: artifact.locator, authority: artifact.authority, error: error instanceof Error ? error.message : String(error) }); }
        }
        if (missingAuthority.length) checks.push({ name: "artifact-authority", level: "FAIL", code: "CONTINUUM_AUTHORITY_UNAVAILABLE", message: `${missingAuthority.length} ArtifactRef(s) cannot be resolved from their authority.`, details: { artifacts: missingAuthority } });
        else checks.push({ name: "artifact-authority", level: "PASS", message: "All ArtifactRef authorities are available." });
      } catch (error) {
        checks.push({ name: "durable", level: "FAIL", code: "CONTINUUM_PROJECT_NOT_FOUND", message: error instanceof Error ? error.message : String(error), recoverable: false });
      }
    }

    const runtime = this.runtimeFactory(root);
    let runtimeHealth = await runtime.health();
    if (options.recover && ["missing", "corrupt", "needs-migration"].includes(runtimeHealth.state ?? "")) {
      try {
        const result: RuntimeRecoveryResult = await runtime.recover();
        recovered ||= result.action !== "none";
        runtimeHealth = await runtime.health();
        checks.push({
          name: "runtime-recovery",
          level: "PASS",
          repaired: result.action !== "none",
          message: result.action === "quarantined-rebuilt" ? `Corrupt runtime.db was quarantined and rebuilt; ${result.quarantinedPaths.length} file(s) preserved.` : result.action === "created" ? "Missing runtime.db was recreated from the current runtime schema." : result.action === "migrated" ? `runtime.db migrated to schema ${result.schemaVersion}.` : "runtime.db did not require recovery.",
          details: { action: result.action, quarantinedPaths: result.quarantinedPaths },
        });
      } catch (error) {
        checks.push({ name: "runtime-recovery", level: "FAIL", code: error instanceof Error && "code" in error ? String((error as any).code) : "CONTINUUM_RUNTIME_CORRUPT", message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (runtimeHealth.state === "healthy") checks.push({ name: "runtime", level: "PASS", message: `runtime.db schema=${runtimeHealth.schemaVersion} driver=${runtimeHealth.driver}` });
    else if (runtimeHealth.state === "needs-migration") checks.push({ name: "runtime", level: "WARN", recoverable: true, message: `runtime.db schema=${runtimeHealth.schemaVersion} needs migration; startup or continuum migrate can advance it.` });
    else if (runtimeHealth.state === "missing") checks.push({ name: "runtime", level: "WARN", recoverable: true, message: "runtime.db is missing; durable project state remains readable. Run continuum doctor --recover to recreate runtime state." });
    else if (runtimeHealth.state === "too-new") checks.push({ name: "runtime", level: "FAIL", code: "CONTINUUM_SCHEMA_TOO_NEW", message: runtimeHealth.error ?? "runtime.db is newer than this CLI." });
    else if (runtimeHealth.state === "corrupt") checks.push({ name: "runtime", level: "FAIL", code: "CONTINUUM_RUNTIME_CORRUPT", recoverable: true, message: runtimeHealth.error ?? "runtime.db is corrupt. Run continuum doctor --recover to quarantine and rebuild it." });
    else if (runtimeHealth.state === "unavailable") checks.push({ name: "runtime", level: "FAIL", code: "CONTINUUM_RUNTIME_DRIVER_MISSING", recoverable: true, message: runtimeHealth.error ?? "Runtime storage driver is unavailable." });

    if (durableUsable && store && runtimeHealth.available) {
      try {
        const bindings = await runtime.listWorktreeBindings();
        const stale: string[] = [];
        for (const binding of bindings) {
          if (!(await store.hasArtifact(binding.targetArtifactId)) || (binding.changeId && !(await store.hasChange(binding.changeId)))) stale.push(binding.worktreeId);
        }
        if (stale.length && options.recover) {
          for (const worktreeId of stale) { await runtime.clearSessionBindingsForWorktree(worktreeId); await runtime.clearWorktreeBinding(worktreeId); }
          recovered = true;
          checks.push({ name: "work-bindings", level: "PASS", repaired: true, message: `Removed ${stale.length} stale Runtime Work Binding(s) that referenced missing Durable nodes.`, details: { worktreeIds: stale } });
        } else if (stale.length) checks.push({ name: "work-bindings", level: "WARN", recoverable: true, message: `${stale.length} Runtime Work Binding(s) reference missing Durable nodes.`, details: { worktreeIds: stale } });
        else checks.push({ name: "work-bindings", level: "PASS", message: `${bindings.length} Runtime Work Binding(s) are structurally valid.` });

        const currentBinding = await runtime.getWorktreeBinding(facts.worktreeIdentity);
        if (currentBinding && currentBinding.workStartRevision !== facts.currentRevision) {
          const pending = await runtime.loadPendingReconcile(currentBinding.workId);
          if (!pending && options.recover) {
            const result = await this.reconcileWork.execute(root);
            recovered ||= result.status === "UPDATED";
            checks.push({ name: "pending-work", level: "PASS", repaired: result.status === "UPDATED", message: result.status === "UPDATED" ? `Recovered pending Work Reconcile for ${currentBinding.targetArtifactId} from Git state.` : `Work ${currentBinding.targetArtifactId} did not require a new reconcile candidate.`, details: { status: result.status, workId: currentBinding.workId } });
          } else if (!pending) {
            checks.push({ name: "pending-work", level: "WARN", recoverable: true, message: `Managed Work ${currentBinding.targetArtifactId} has Git changes but no pending reconcile. Run continuum doctor --recover.`, details: { workId: currentBinding.workId, baseRevision: currentBinding.workStartRevision, currentRevision: facts.currentRevision } });
          } else checks.push({ name: "pending-work", level: "PASS", message: `Pending Work Reconcile already exists for ${currentBinding.targetArtifactId}.` });
        }
      } catch (error) {
        checks.push({ name: "runtime-work", level: "FAIL", code: "CONTINUUM_RUNTIME_CORRUPT", message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (baselineRevision && baselineRevision !== facts.currentRevision) {
      try {
        const changedFiles = (await this.git.getChangedFiles(root, baselineRevision, facts.currentRevision)).filter(path => !isContinuumInternalPath(path));
        if (changedFiles.length) checks.push({ name: "unreconciled-git", level: "WARN", recoverable: false, message: `Git HEAD differs from Current Snapshot by ${changedFiles.length} business file(s). This delta is preserved; Continuum will not guess a Work owner if Runtime binding was lost.`, details: { baselineRevision, currentRevision: facts.currentRevision, changedFiles } });
      } catch (error) {
        checks.push({ name: "unreconciled-git", level: "WARN", message: error instanceof Error ? error.message : String(error) });
      }
    }

    try {
      const hostDiagnostics = await this.hostFactory(root).inspect();
      for (const host of hostDiagnostics) checks.push({ name: `host-${host.host}`, level: host.level, code: host.level === "WARN" ? "CONTINUUM_HOST_UNAVAILABLE" : undefined, recoverable: host.level === "WARN", message: host.message, details: host.details });
    } catch (error) {
      checks.push({ name: "host-diagnostics", level: "WARN", recoverable: true, message: error instanceof Error ? error.message : String(error) });
    }

    return { ok: !checks.some(check => check.level === "FAIL"), recovered, checks };
  }
}
