import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactRef } from "../../../domain/artifact/artifact-ref.js";
import { assertArtifactRefInvariant } from "../../../domain/artifact/artifact-ref.js";
import type { Change } from "../../../domain/change/change.js";
import { assertChangeInvariant } from "../../../domain/change/change.js";
import type { Project } from "../../../domain/project/project.js";
import type { ChangeReconcile } from "../../../domain/reconcile/change-reconcile.js";
import { assertChangeReconcileInvariant } from "../../../domain/reconcile/change-reconcile.js";
import type { Relation } from "../../../domain/relation/relation.js";
import { assertRelationInvariant } from "../../../domain/relation/relation.js";
import type { CurrentPointer, Snapshot } from "../../../domain/snapshot/snapshot.js";
import type { ProjectStorePort } from "../../../ports/project-store.js";
import { ContinuumError } from "../../../shared/errors/continuum-error.js";
import { SchemaValidator, type SchemaName } from "../../../shared/schema/schema-validator.js";
import { atomicWriteFile } from "./atomic-file.js";
import { YamlCodec } from "./yaml-codec.js";

function projectToDoc(p: Project) {
  return { schema_version: p.schemaVersion, project_id: p.projectId, name: p.name, created_at: p.createdAt, repository: { identity: p.repository.identity } };
}
function snapshotToDoc(s: Snapshot) {
  return {
    schema_version: s.schemaVersion, snapshot_id: s.snapshotId, project_id: s.projectId, created_at: s.createdAt,
    baselines: s.baselines.map(b => ({ repository_identity: b.repositoryIdentity, revision: b.revision })),
    ...(s.stage ? { stage: s.stage } : {}), active_changes: s.activeChanges, blockers: s.blockers,
    ...(s.nextGate ? { next_gate: s.nextGate } : {}), ...(s.lastReconcile ? { last_reconcile: s.lastReconcile } : {}),
  };
}
function currentToDoc(c: CurrentPointer) { return { schema_version: c.schemaVersion, project_id: c.projectId, snapshot_id: c.snapshotId, updated_at: c.updatedAt }; }
function changeToDoc(c: Change) {
  return {
    schema_version: c.schemaVersion, change_id: c.changeId, title: c.title, ...(c.intent ? { intent: c.intent } : {}), status: c.status,
    created_at: c.createdAt, ...(c.closedAt ? { closed_at: c.closedAt } : {}), ...(c.supersededBy ? { superseded_by: c.supersededBy } : {}),
    spec_refs: c.specRefs, ticket_refs: c.ticketRefs,
  };
}
function artifactToDoc(a: ArtifactRef) {
  return {
    schema_version: a.schemaVersion, artifact_id: a.artifactId, type: a.type, authority: a.authority, locator: a.locator,
    ...(a.version ? { version: a.version } : {}), ...(a.title ? { title: a.title } : {}), ...(a.metadata ? { metadata: a.metadata } : {}),
  };
}
function relationToDoc(r: Relation) {
  return { schema_version: r.schemaVersion, relation_id: r.relationId, from: r.from, to: r.to, type: r.type, routing: r.routing, created_at: r.createdAt };
}

function changeReconcileToDoc(r: ChangeReconcile) {
  return {
    schema_version: r.schemaVersion, reconcile_id: r.reconcileId, project_id: r.projectId, change_id: r.changeId,
    input_snapshot_id: r.inputSnapshotId, implementation_revision: r.implementationRevision, created_at: r.createdAt,
    implementation_summary: r.implementationSummary,
    resolved_work: r.resolvedWork.map(w => ({
      ticket_id: w.ticketId, work_id: w.workId, base_revision: w.baseRevision, current_revision: w.currentRevision,
      knowledge_impact: w.knowledgeImpact, changed_files: w.changedFiles, evidence: w.evidence,
    })),
    unresolved_work: r.unresolvedWork.map(w => ({ ticket_id: w.ticketId, reason: w.reason })),
    knowledge_changes: r.knowledgeChanges.map(k => ({ ticket_id: k.ticketId, impact: k.impact, note: k.note })),
    architecture_decisions: r.architectureDecisions.map(a => ({ ticket_id: a.ticketId, note: a.note })),
    discovered_work: r.discoveredWork, result: r.result, block_reasons: r.blockReasons,
  };
}

function safeNodeId(id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", `Unsupported identifier for durable path: ${id}`);
  return id;
}

export class YamlProjectStore implements ProjectStorePort {
  private readonly root: string;
  private readonly repositoryRoot: string;
  private readonly codec = new YamlCodec();
  private readonly validator = new SchemaValidator();
  constructor(repositoryRoot: string) { this.repositoryRoot = repositoryRoot; this.root = join(repositoryRoot, ".continuum"); }
  async exists(): Promise<boolean> { return existsSync(join(this.root, "project.yaml")); }

  async initialize(project: Project, snapshot: Snapshot, current: CurrentPointer): Promise<void> {
    if (await this.exists()) throw new ContinuumError("CONTINUUM_ALREADY_INITIALIZED", "Continuum is already initialized in this repository.");
    try {
      for (const dir of ["snapshots", "changes", "artifacts", "relations", "reconciles", "archives"]) mkdirSync(join(this.root, dir), { recursive: true });
      const p = projectToDoc(project), s = snapshotToDoc(snapshot), c = currentToDoc(current);
      this.validator.validate("project", p); this.validator.validate("snapshot", s); this.validator.validate("current", c);
      atomicWriteFile(join(this.root, "project.yaml"), this.codec.stringify(p));
      atomicWriteFile(join(this.root, "snapshots", `${snapshot.snapshotId}.yaml`), this.codec.stringify(s));
      atomicWriteFile(join(this.root, "current.yaml"), this.codec.stringify(c));
    } catch (error) {
      rmSync(this.root, { recursive: true, force: true });
      throw error;
    }
  }

  private readDoc(schema: SchemaName, path: string): any {
    if (!existsSync(path)) throw new ContinuumError("CONTINUUM_PROJECT_NOT_FOUND", `Required Continuum state is missing: ${path}`);
    let doc: unknown;
    try { doc = this.codec.parse(readFileSync(path, "utf8")); }
    catch (error) { throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", `Cannot parse ${path}`, false, { cause: String(error) }); }
    this.validator.validate(schema, doc);
    return doc;
  }

  private listDocs<T>(dirName: string, prefix: string, schema: SchemaName, mapper: (doc: any) => T): T[] {
    const dir = join(this.root, dirName);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter(name => name.startsWith(prefix) && name.endsWith(".yaml"))
      .sort()
      .map(name => mapper(this.readDoc(schema, join(dir, name))));
  }

  async loadProject(): Promise<Project> {
    const d = this.readDoc("project", join(this.root, "project.yaml"));
    return { schemaVersion: d.schema_version, projectId: d.project_id, name: d.name, createdAt: d.created_at, repository: { identity: d.repository.identity } };
  }
  async loadCurrent(): Promise<CurrentPointer> {
    const d = this.readDoc("current", join(this.root, "current.yaml"));
    return { schemaVersion: d.schema_version, projectId: d.project_id, snapshotId: d.snapshot_id, updatedAt: d.updated_at };
  }
  async loadSnapshot(snapshotId: string): Promise<Snapshot> {
    const d = this.readDoc("snapshot", join(this.root, "snapshots", `${safeNodeId(snapshotId)}.yaml`));
    return {
      schemaVersion: d.schema_version, snapshotId: d.snapshot_id, projectId: d.project_id, createdAt: d.created_at,
      baselines: d.baselines.map((b: any) => ({ repositoryIdentity: b.repository_identity, revision: b.revision })),
      stage: d.stage, activeChanges: d.active_changes, blockers: d.blockers, nextGate: d.next_gate, lastReconcile: d.last_reconcile,
    };
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    const path = join(this.root, "snapshots", `${safeNodeId(snapshot.snapshotId)}.yaml`);
    const d = snapshotToDoc(snapshot);
    this.validator.validate("snapshot", d);
    if (existsSync(path)) {
      const existing = this.readDoc("snapshot", path);
      if (JSON.stringify(existing) === JSON.stringify(d)) return;
      throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", `Snapshot is immutable and already exists with different content: ${snapshot.snapshotId}`);
    }
    atomicWriteFile(path, this.codec.stringify(d));
  }

  async advanceCurrent(expectedSnapshotId: string, newSnapshotId: string, updatedAt: string): Promise<void> {
    const lockDir = join(this.repositoryRoot, ".continuum-local", "locks");
    mkdirSync(lockDir, { recursive: true });
    const lockPath = join(lockDir, "current.lock");
    let fd: number;
    try { fd = openSync(lockPath, "wx", 0o600); writeFileSync(fd, `${process.pid}\n${updatedAt}\n`, "utf8"); }
    catch (error: any) {
      if (error?.code === "EEXIST") throw new ContinuumError("CONTINUUM_SNAPSHOT_CONFLICT", "Current Snapshot is being advanced by another Continuum process.", true);
      throw error;
    }
    try {
      const current = await this.loadCurrent();
      if (current.snapshotId !== expectedSnapshotId) {
        throw new ContinuumError("CONTINUUM_SNAPSHOT_CONFLICT", `Current Snapshot changed from ${expectedSnapshotId} to ${current.snapshotId}; refusing to overwrite.`, true, { expected: expectedSnapshotId, actual: current.snapshotId });
      }
      await this.loadSnapshot(newSnapshotId);
      const next: CurrentPointer = { schemaVersion: 1, projectId: current.projectId, snapshotId: newSnapshotId, updatedAt };
      const d = currentToDoc(next); this.validator.validate("current", d);
      atomicWriteFile(join(this.root, "current.yaml"), this.codec.stringify(d));
    } finally {
      closeSync(fd!);
      try { unlinkSync(lockPath); } catch {}
    }
  }

  async saveChange(change: Change): Promise<void> {
    assertChangeInvariant(change);
    const d = changeToDoc(change); this.validator.validate("change", d);
    atomicWriteFile(join(this.root, "changes", `change_${safeNodeId(change.changeId)}.yaml`), this.codec.stringify(d));
  }
  async loadChange(changeId: string): Promise<Change> {
    const path = join(this.root, "changes", `change_${safeNodeId(changeId)}.yaml`);
    if (!existsSync(path)) throw new ContinuumError("CONTINUUM_CHANGE_NOT_FOUND", `Change not found: ${changeId}`, true);
    const d = this.readDoc("change", path); const change=this.changeFromDoc(d); assertChangeInvariant(change); return change;
  }
  async listChanges(): Promise<Change[]> { return this.listDocs("changes", "change_", "change", d => this.changeFromDoc(d)); }
  async hasChange(changeId: string): Promise<boolean> { return existsSync(join(this.root, "changes", `change_${safeNodeId(changeId)}.yaml`)); }
  private changeFromDoc(d: any): Change {
    return { schemaVersion:d.schema_version, changeId:d.change_id, title:d.title, intent:d.intent, status:d.status, createdAt:d.created_at, closedAt:d.closed_at, supersededBy:d.superseded_by, specRefs:d.spec_refs, ticketRefs:d.ticket_refs };
  }

  async saveArtifact(artifact: ArtifactRef): Promise<void> {
    assertArtifactRefInvariant(artifact);
    const d = artifactToDoc(artifact); this.validator.validate("artifact", d);
    atomicWriteFile(join(this.root, "artifacts", `artifact_${safeNodeId(artifact.artifactId)}.yaml`), this.codec.stringify(d));
  }
  async loadArtifact(artifactId: string): Promise<ArtifactRef> {
    const path = join(this.root, "artifacts", `artifact_${safeNodeId(artifactId)}.yaml`);
    if (!existsSync(path)) throw new ContinuumError("CONTINUUM_ARTIFACT_NOT_FOUND", `Artifact not found: ${artifactId}`, true);
    const d = this.readDoc("artifact", path); const artifact=this.artifactFromDoc(d); assertArtifactRefInvariant(artifact); return artifact;
  }
  async listArtifacts(): Promise<ArtifactRef[]> { return this.listDocs("artifacts", "artifact_", "artifact", d => this.artifactFromDoc(d)); }
  async hasArtifact(artifactId: string): Promise<boolean> { return existsSync(join(this.root, "artifacts", `artifact_${safeNodeId(artifactId)}.yaml`)); }
  private artifactFromDoc(d: any): ArtifactRef {
    return { schemaVersion:d.schema_version, artifactId:d.artifact_id, type:d.type, authority:d.authority, locator:d.locator, version:d.version, title:d.title, metadata:d.metadata };
  }

  async saveRelation(relation: Relation): Promise<void> {
    assertRelationInvariant(relation);
    const d = relationToDoc(relation); this.validator.validate("relation", d);
    atomicWriteFile(join(this.root, "relations", `rel_${safeNodeId(relation.relationId.slice(4))}.yaml`), this.codec.stringify(d));
  }
  async loadRelation(relationId: string): Promise<Relation> {
    const path = join(this.root, "relations", `${safeNodeId(relationId)}.yaml`);
    if (!existsSync(path)) throw new ContinuumError("CONTINUUM_RELATION_NOT_FOUND", `Relation not found: ${relationId}`, true);
    const d = this.readDoc("relation", path); const relation=this.relationFromDoc(d); assertRelationInvariant(relation); return relation;
  }
  async listRelations(): Promise<Relation[]> { return this.listDocs("relations", "rel_", "relation", d => this.relationFromDoc(d)); }
  async listRelationsFor(nodeId: string): Promise<Relation[]> { return (await this.listRelations()).filter(r => r.from === nodeId || r.to === nodeId); }
  private relationFromDoc(d: any): Relation { return { schemaVersion:d.schema_version, relationId:d.relation_id, from:d.from, to:d.to, type:d.type, routing:d.routing, createdAt:d.created_at }; }

  async saveChangeReconcile(reconcile: ChangeReconcile): Promise<void> {
    assertChangeReconcileInvariant(reconcile);
    const d = changeReconcileToDoc(reconcile); this.validator.validate("changeReconcile", d);
    const path = join(this.root, "reconciles", `change_${safeNodeId(reconcile.changeId)}_${safeNodeId(reconcile.reconcileId)}.yaml`);
    if (existsSync(path)) {
      const existing = this.readDoc("changeReconcile", path);
      if (JSON.stringify(existing) === JSON.stringify(d)) return;
      throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", `Change Reconcile is immutable and already exists with different content: ${reconcile.reconcileId}`);
    }
    atomicWriteFile(path, this.codec.stringify(d));
  }

  async loadChangeReconcile(reconcileId: string): Promise<ChangeReconcile> {
    const dir = join(this.root, "reconciles");
    const suffix = `_${safeNodeId(reconcileId)}.yaml`;
    const name = existsSync(dir) ? readdirSync(dir).find(n => n.startsWith("change_") && n.endsWith(suffix)) : undefined;
    if (!name) throw new ContinuumError("CONTINUUM_RECONCILE_NOT_FOUND", `Change Reconcile not found: ${reconcileId}`, true);
    const d = this.readDoc("changeReconcile", join(dir, name));
    const value: ChangeReconcile = {
      schemaVersion:d.schema_version, reconcileId:d.reconcile_id, projectId:d.project_id, changeId:d.change_id, inputSnapshotId:d.input_snapshot_id,
      implementationRevision:d.implementation_revision, createdAt:d.created_at, implementationSummary:d.implementation_summary,
      resolvedWork:d.resolved_work.map((w:any)=>({ticketId:w.ticket_id,workId:w.work_id,baseRevision:w.base_revision,currentRevision:w.current_revision,knowledgeImpact:w.knowledge_impact,changedFiles:w.changed_files,evidence:w.evidence})),
      unresolvedWork:d.unresolved_work.map((w:any)=>({ticketId:w.ticket_id,reason:w.reason})),
      knowledgeChanges:d.knowledge_changes.map((k:any)=>({ticketId:k.ticket_id,impact:k.impact,note:k.note})),
      architectureDecisions:d.architecture_decisions.map((a:any)=>({ticketId:a.ticket_id,note:a.note})),
      discoveredWork:d.discovered_work, result:d.result, blockReasons:d.block_reasons,
    };
    assertChangeReconcileInvariant(value); return value;
  }

  async hasChangeReconcile(reconcileId: string): Promise<boolean> {
    const dir = join(this.root, "reconciles");
    const suffix = `_${safeNodeId(reconcileId)}.yaml`;
    return existsSync(dir) && readdirSync(dir).some(n => n.startsWith("change_") && n.endsWith(suffix));
  }

  async nodeExists(nodeId: string): Promise<boolean> { return (await this.hasChange(nodeId)) || (await this.hasArtifact(nodeId)); }
}
