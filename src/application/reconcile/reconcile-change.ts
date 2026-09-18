import { createHash } from "node:crypto";
import type { Change } from "../../domain/change/change.js";
import { assertChangeTransition } from "../../domain/change/change.js";
import type { ChangeReconcile, ResolvedWorkSummary } from "../../domain/reconcile/change-reconcile.js";
import { assertChangeReconcileInvariant } from "../../domain/reconcile/change-reconcile.js";
import type { InteractionRequest } from "../../domain/interaction/interaction.js";
import { assertInteractionInvariant } from "../../domain/interaction/interaction.js";
import type { Snapshot } from "../../domain/snapshot/snapshot.js";
import { assertSnapshotInvariant } from "../../domain/snapshot/snapshot.js";
import type { WorkBinding } from "../../domain/work/work-binding.js";
import type { WorkReconcileCandidate } from "../../domain/reconcile/work-reconcile.js";
import type { ArtifactAuthorityPort } from "../../ports/artifact-authority.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";

interface RuntimeWorkFact {
  root: string;
  runtime: RuntimeStorePort;
  binding: WorkBinding;
  candidate: WorkReconcileCandidate;
}

export interface ReconcileChangeResult {
  status: "CLOSED" | "RECOVERED";
  reconcile: ChangeReconcile;
  snapshot: Snapshot;
  change: Change;
}

function stableId(prefix: string, input: string): string {
  return `${prefix}_${createHash("sha256").update(input).digest("hex").slice(0, 32)}`;
}

function evidencePass(candidate: WorkReconcileCandidate): boolean {
  return candidate.evidence.tests.status === "PASS" && candidate.evidence.review.status === "PASS" && candidate.evidence.completion.status === "PASS";
}

interface DesignArtifactVersion {
  artifactId: string;
  type: "spec" | "adr" | "context";
  version?: string;
}

export class ReconcileChange {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root: string) => ProjectStorePort,
    private readonly runtimeFactory: (root: string) => RuntimeStorePort,
    private readonly authorityFactory: (root: string) => ArtifactAuthorityPort,
    private readonly clock: ClockPort,
  ) {}

  private async runtimeFacts(cwd: string, changeId: string, integrationRevision: string): Promise<RuntimeWorkFact[]> {
    const roots = await this.git.listWorktreeRoots(cwd);
    const facts: RuntimeWorkFact[] = [];
    for (const root of roots) {
      const runtime = this.runtimeFactory(root);
      const health = await runtime.health();
      if (!health.available) continue;
      const bindings = await runtime.listWorktreeBindings();
      const candidates = await runtime.listPendingReconciles();
      const candidateByWork = new Map(candidates.map(candidate => [candidate.workId, candidate]));
      for (const binding of bindings) {
        if (binding.changeId !== changeId) continue;
        const candidate = candidateByWork.get(binding.workId);
        if (!candidate) continue;
        if (!(await this.git.isAncestor(cwd, candidate.currentRevision, integrationRevision))) continue;
        facts.push({ root, runtime, binding, candidate });
      }
    }
    return facts;
  }

  private async cleanupRuntime(facts: RuntimeWorkFact[]): Promise<void> {
    for (const fact of facts) {
      await fact.runtime.deletePendingReconcile(fact.binding.workId);
      await fact.runtime.clearWorktreeBinding(fact.binding.worktreeId);
    }
  }

  private async validateSpecs(store: ProjectStorePort, authority: ArtifactAuthorityPort, change: Change): Promise<void> {
    if (change.specRefs.length < 1) throw new ContinuumError("CONTINUUM_CHANGE_NOT_READY", `Change ${change.changeId} has no Spec ArtifactRef.`, true);
    for (const specId of change.specRefs) {
      const artifact = await store.loadArtifact(specId);
      if (artifact.type !== "spec") throw new ContinuumError("CONTINUUM_CHANGE_NOT_READY", `Change spec ref is not a Spec: ${specId}`, true);
      const resolved = await authority.resolve(artifact);
      if (!resolved.exists || !resolved.content?.trim()) throw new ContinuumError("CONTINUUM_AUTHORITY_UNAVAILABLE", `Spec is unavailable or empty: ${specId}`, true);
    }
  }

  private async designArtifactVersions(
    store: ProjectStorePort,
    authority: ArtifactAuthorityPort,
    change: Change,
    affectedTickets: string[],
    revision: string,
  ): Promise<DesignArtifactVersion[]> {
    const artifactIds = new Set<string>(change.specRefs);
    const relations = await store.listRelations();
    const frontier = [...affectedTickets, ...change.specRefs];
    const visited = new Set<string>();
    for (let depth = 0; depth < 2; depth += 1) {
      const next: string[] = [];
      for (const from of frontier.splice(0, frontier.length)) {
        if (visited.has(from)) continue;
        visited.add(from);
        for (const relation of relations.filter(item => item.from === from && item.routing !== "historical")) {
          if (relation.type !== "governed_by" && relation.type !== "domain_context" && relation.type !== "belongs_to") continue;
          if (!(await store.hasArtifact(relation.to))) continue;
          const artifact = await store.loadArtifact(relation.to);
          if (artifact.type === "spec" || artifact.type === "adr" || artifact.type === "context") artifactIds.add(artifact.artifactId);
          next.push(artifact.artifactId);
        }
      }
      frontier.push(...next);
    }

    const out: DesignArtifactVersion[] = [];
    for (const artifactId of [...artifactIds].sort()) {
      if (!(await store.hasArtifact(artifactId))) continue;
      const artifact = await store.loadArtifact(artifactId);
      if (artifact.type !== "spec" && artifact.type !== "adr" && artifact.type !== "context") continue;
      const version = await authority.getVersionAtRevision(artifact, revision);
      out.push({ artifactId: artifact.artifactId, type: artifact.type, ...(version ? { version } : {}) });
    }
    return out;
  }

  private interaction(change: Change, revision: string, type: "DECISION" | "BLOCK", now: string, reason: string, context?: Record<string, unknown>): InteractionRequest {
    const request: InteractionRequest = {
      id: stableId("int", `${change.changeId}:${revision}:${type}:${reason}`),
      type,
      title: type === "DECISION" ? `Architecture decision required before closing ${change.title}` : `Change ${change.title} is blocked`,
      message: reason,
      reason,
      ...(type === "DECISION" ? { options: [
        { id: "return-to-adr", label: "Return to architecture decision / ADR" },
        { id: "keep-active", label: "Keep Change active" },
      ] } : {}),
      ...(context ? { context } : {}),
      blocking: true,
      createdAt: now,
    };
    assertInteractionInvariant(request);
    return request;
  }

  async execute(cwd: string, changeId: string): Promise<ReconcileChangeResult> {
    const gitFacts = await this.git.inspect(cwd);
    const store = this.storeFactory(gitFacts.root);
    const project = await store.loadProject();
    let change = await store.loadChange(changeId);
    if (change.status !== "active") throw new ContinuumError("CONTINUUM_CHANGE_NOT_READY", `Change ${changeId} is ${change.status}; only active Changes can be reconciled.`, true);

    const current = await store.loadCurrent();
    const inputSnapshot = await store.loadSnapshot(current.snapshotId);

    // Recovery path for a crash after Current advanced but before the Change file was marked closed.
    if (inputSnapshot.lastReconcile) {
      try {
        const prior = await store.loadChangeReconcile(inputSnapshot.lastReconcile);
        const currentBaseline = inputSnapshot.baselines.find(b => b.repositoryIdentity === project.repository.identity) ?? inputSnapshot.baselines[0];
        if (prior.changeId === change.changeId && prior.result === "pass" && currentBaseline?.revision === gitFacts.currentRevision) {
          assertChangeTransition(change.status, "closed");
          change = { ...change, status: "closed", closedAt: this.clock.nowIso() };
          await store.saveChange(change);
          const runtimeFacts = await this.runtimeFacts(cwd, changeId, gitFacts.currentRevision);
          await this.cleanupRuntime(runtimeFacts);
          return { status: "RECOVERED", reconcile: prior, snapshot: inputSnapshot, change };
        }
      } catch (error) {
        if (!(error instanceof ContinuumError) || error.code !== "CONTINUUM_RECONCILE_NOT_FOUND") throw error;
      }
    }

    const authority = this.authorityFactory(gitFacts.root);
    await this.validateSpecs(store, authority, change);
    if (change.ticketRefs.length < 1) throw new ContinuumError("CONTINUUM_CHANGE_NOT_READY", `Change ${changeId} has no Ticket ArtifactRef.`, true);

    for (const ticketId of change.ticketRefs) {
      const ticket = await store.loadArtifact(ticketId);
      if (ticket.type !== "ticket") throw new ContinuumError("CONTINUUM_CHANGE_NOT_READY", `Change ticket ref is not a Ticket: ${ticketId}`, true);
    }

    const runtimeFacts = await this.runtimeFacts(cwd, changeId, gitFacts.currentRevision);
    const grouped = new Map<string, RuntimeWorkFact[]>();
    for (const fact of runtimeFacts) {
      const list = grouped.get(fact.binding.targetArtifactId) ?? [];
      list.push(fact); grouped.set(fact.binding.targetArtifactId, list);
    }

    const resolvedWork: ResolvedWorkSummary[] = [];
    const unresolvedWork: Array<{ ticketId: string; reason: string }> = [];
    const selectedFacts: RuntimeWorkFact[] = [];
    for (const ticketId of change.ticketRefs) {
      const matches = grouped.get(ticketId) ?? [];
      if (matches.length === 0) {
        unresolvedWork.push({ ticketId, reason: "No integrated Work Reconcile Candidate is available." });
        continue;
      }
      if (matches.length > 1) {
        unresolvedWork.push({ ticketId, reason: "Multiple integrated Work Reconcile Candidates exist; explicit convergence is required." });
        continue;
      }
      const fact = matches[0];
      if (!evidencePass(fact.candidate)) {
        unresolvedWork.push({ ticketId, reason: `Evidence is not fully PASS (tests=${fact.candidate.evidence.tests.status}, review=${fact.candidate.evidence.review.status}, completion=${fact.candidate.evidence.completion.status}).` });
        continue;
      }
      selectedFacts.push(fact);
      resolvedWork.push({
        ticketId,
        workId: fact.binding.workId,
        baseRevision: fact.candidate.baseRevision,
        currentRevision: fact.candidate.currentRevision,
        knowledgeImpact: fact.candidate.knowledgeImpact,
        changedFiles: fact.candidate.changedFiles,
        evidence: fact.candidate.evidence,
      });
    }

    if (unresolvedWork.length) {
      throw new ContinuumError("CONTINUUM_EVIDENCE_UNKNOWN", `Change ${changeId} cannot close because required Work is unresolved.`, true, { unresolvedWork });
    }

    const now = this.clock.nowIso();
    const reconcileId = stableId("crec", `${change.changeId}:${current.snapshotId}:${gitFacts.currentRevision}`);
    const knowledgeChanges = resolvedWork.filter(w => w.knowledgeImpact === "N2").map(w => ({ ticketId:w.ticketId, impact:w.knowledgeImpact, note:"Domain knowledge changed; CONTEXT update is part of the reconciled implementation." }));
    const architectureDecisions = resolvedWork.filter(w => w.knowledgeImpact === "N3").map(w => ({ ticketId:w.ticketId, note:"Architecture impact requires an explicit ADR decision before the Change can close." }));
    const n4 = resolvedWork.filter(w => w.knowledgeImpact === "N4");
    const blockReasons = n4.map(w => `${w.ticketId} invalidates the current Spec or Change scope.`);

    const blocked = architectureDecisions.length > 0 || blockReasons.length > 0;
    const reconcile: ChangeReconcile = {
      schemaVersion:1, reconcileId, projectId:project.projectId, changeId:change.changeId, inputSnapshotId:current.snapshotId,
      implementationRevision:gitFacts.currentRevision, createdAt:now,
      implementationSummary:`Resolved ${resolvedWork.length} required Work item(s) at ${gitFacts.currentRevision}.`,
      resolvedWork, unresolvedWork:[], knowledgeChanges, architectureDecisions, discoveredWork:[],
      result: blocked ? "blocked" : "pass", blockReasons,
    };
    assertChangeReconcileInvariant(reconcile);

    if (blocked) {
      await store.saveChangeReconcile(reconcile);
      const runtime = this.runtimeFactory(gitFacts.root); await runtime.initialize();
      if (architectureDecisions.length) {
        const interaction = this.interaction(change, gitFacts.currentRevision, "DECISION", now, architectureDecisions.map(a => `${a.ticketId}: ${a.note}`).join("\n"));
        await runtime.savePendingInteraction(interaction);
        throw new ContinuumError("CONTINUUM_DECISION_REQUIRED", "Architecture decision is required before Change close.", true, { interaction });
      }
      const affectedTickets = n4.map(work => work.ticketId);
      const designArtifacts = await this.designArtifactVersions(store, authority, change, affectedTickets, gitFacts.currentRevision);
      const interaction = this.interaction(change, gitFacts.currentRevision, "BLOCK", now, blockReasons.join("\n"), {
        scope: "change",
        changeId: change.changeId,
        affectedTickets,
        blockedRevision: gitFacts.currentRevision,
        blockPhase: "implementation",
        designArtifacts,
      });
      if (affectedTickets.length === 1) {
        interaction.title = `${affectedTickets[0]} 暂停实现：发现设计冲突`;
        interaction.message = `${blockReasons.join("\n")} 继续实现会使代码与当前设计失去一致性。`;
      }
      await runtime.savePendingInteraction(interaction);
      throw new ContinuumError("CONTINUUM_BLOCKED", "Change close is blocked by a design/scope gap.", true, { interaction });
    }

    await store.saveChangeReconcile(reconcile);
    const allChanges = await store.listChanges();
    const nextActive = allChanges.filter(c => c.status === "active" && c.changeId !== change.changeId).map(c => c.changeId).sort();
    const snapshotId = stableId("snap", reconcileId);
    const snapshot: Snapshot = {
      schemaVersion:1, snapshotId, projectId:project.projectId, createdAt:now,
      baselines:[{ repositoryIdentity: project.repository.identity, revision:gitFacts.currentRevision }],
      ...(inputSnapshot.stage ? { stage:inputSnapshot.stage } : {}),
      activeChanges:nextActive, blockers:inputSnapshot.blockers,
      ...(inputSnapshot.nextGate ? { nextGate:inputSnapshot.nextGate } : {}),
      lastReconcile:reconcile.reconcileId,
    };
    assertSnapshotInvariant(snapshot);
    await store.saveSnapshot(snapshot);
    await store.advanceCurrent(current.snapshotId, snapshot.snapshotId, now);

    assertChangeTransition(change.status, "closed");
    change = { ...change, status:"closed", closedAt:now };
    await store.saveChange(change);
    await this.cleanupRuntime(selectedFacts);
    return { status:"CLOSED", reconcile, snapshot, change };
  }
}
