import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
import type { ReconcileWork, ReconcileWorkResult } from "../reconcile/reconcile-work.js";

export interface LifecycleCheckpointInput {
  source: string;
  sessionId?: string;
  host?: string;
}

export interface LifecycleCheckpointResult {
  status: "NOOP" | "SUPPRESSED" | "UNMANAGED" | "RECONCILED";
  source: string;
  reconcile?: ReconcileWorkResult;
}

export class LifecycleCheckpoint {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root: string) => ProjectStorePort,
    private readonly runtimeFactory: (root: string) => RuntimeStorePort,
    private readonly reconcileWork: ReconcileWork,
  ) {}

  async execute(cwd: string, input: LifecycleCheckpointInput): Promise<LifecycleCheckpointResult> {
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    await store.loadProject();
    const runtime = this.runtimeFactory(facts.root);
    const health = await runtime.health();
    if (!health.available) return { status: "UNMANAGED", source: input.source };
    if (input.sessionId && input.host && await runtime.isSessionSuppressed(input.sessionId, input.host)) {
      return { status: "SUPPRESSED", source: input.source };
    }
    const binding = await runtime.getWorktreeBinding(facts.worktreeIdentity);
    if (!binding) return { status: "UNMANAGED", source: input.source };
    const reconcile = await this.reconcileWork.execute(cwd);
    if (reconcile.status === "NOOP") return { status: "NOOP", source: input.source, reconcile };
    return { status: "RECONCILED", source: input.source, reconcile };
  }
}
