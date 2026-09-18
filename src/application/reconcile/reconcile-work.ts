import { actionsForImpact, classifyKnowledgeImpact, isContinuumInternalPath, type WorkReconcileCandidate } from "../../domain/reconcile/work-reconcile.js";
import type { ClockPort } from "../../ports/clock.js";
import type { EvidencePort } from "../../ports/evidence.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";

export type WorkReconcileStatus = "NOOP" | "UPDATED" | "DEDUPED";

export interface ReconcileWorkResult {
  status: WorkReconcileStatus;
  candidate: WorkReconcileCandidate | null;
  idempotencyKey?: string;
}

export class ReconcileWork {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root: string) => ProjectStorePort,
    private readonly runtimeFactory: (root: string) => RuntimeStorePort,
    private readonly evidence: EvidencePort,
    private readonly clock: ClockPort,
  ) {}

  async execute(cwd: string): Promise<ReconcileWorkResult> {
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    await store.loadProject();
    const runtime = this.runtimeFactory(facts.root);
    await runtime.initialize();
    const binding = await runtime.getWorktreeBinding(facts.worktreeIdentity);
    if (!binding) throw new ContinuumError("CONTINUUM_WORK_NOT_FOUND", "No managed Work is bound to the current worktree.", true);

    if (binding.workStartRevision === facts.currentRevision) return { status: "NOOP", candidate: null };

    const rawChangedFiles = await this.git.getChangedFiles(facts.root, binding.workStartRevision, facts.currentRevision);
    const changedFiles = rawChangedFiles.filter(path => !isContinuumInternalPath(path));
    if (changedFiles.length === 0) return { status: "NOOP", candidate: null };

    const key = `work-reconcile:${binding.worktreeId}:${binding.workId}:${facts.currentRevision}`;
    if (await runtime.hasIdempotencyKey(key)) {
      return { status: "DEDUPED", candidate: await runtime.loadPendingReconcile(binding.workId), idempotencyKey: key };
    }

    // Force the diff read here even though v0.5 does not persist the body. This proves
    // reconciliation is derived from the authoritative Git delta, not only filenames.
    await this.git.getDiff(facts.root, binding.workStartRevision, facts.currentRevision);

    const evidence = {
      tests: await this.evidence.collectTests(binding.workId),
      review: await this.evidence.collectReview(binding.workId),
      completion: await this.evidence.verifyCompletion(binding.workId),
    };
    const knowledgeImpact = classifyKnowledgeImpact(changedFiles);
    const candidate: WorkReconcileCandidate = {
      workId: binding.workId,
      baseRevision: binding.workStartRevision,
      currentRevision: facts.currentRevision,
      changedFiles,
      evidence,
      knowledgeImpact,
      actions: actionsForImpact(knowledgeImpact),
      updatedAt: this.clock.nowIso(),
    };
    await runtime.savePendingReconcile(candidate);
    await runtime.saveIdempotencyKey(key, candidate.updatedAt);
    return { status: "UPDATED", candidate, idempotencyKey: key };
  }
}
