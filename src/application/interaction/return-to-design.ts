import type { InteractionRequest } from "../../domain/interaction/interaction.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";

export interface ReturnToDesignInput {
  interactionId: string;
  sessionId?: string;
  host?: string;
}

export interface ReturnToDesignResult {
  interaction: InteractionRequest;
  releasedWorkId?: string;
  releasedTargetArtifactId?: string;
  changeId?: string;
  blockerStillActive: true;
}

function stringContext(request: InteractionRequest, key: string): string | undefined {
  const value = request.context?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export class ReturnToDesign {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root: string) => ProjectStorePort,
    private readonly runtimeFactory: (root: string) => RuntimeStorePort,
  ) {}

  async execute(cwd: string, input: ReturnToDesignInput): Promise<ReturnToDesignResult> {
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    await store.loadProject();
    const runtime = this.runtimeFactory(facts.root);
    const request = await runtime.loadPendingInteraction(input.interactionId);
    if (!request || request.type !== "BLOCK") {
      throw new ContinuumError("CONTINUUM_INTERACTION_NOT_FOUND", `Pending BLOCK interaction not found: ${input.interactionId}`, true);
    }

    const blockedChangeId = stringContext(request, "changeId");
    const binding = await runtime.getWorktreeBinding(facts.worktreeIdentity);
    if (binding) {
      if (blockedChangeId && binding.changeId && binding.changeId !== blockedChangeId) {
        throw new ContinuumError("CONTINUUM_BLOCKED", `BLOCK ${request.id} belongs to ${blockedChangeId}, but the worktree is bound to ${binding.changeId}.`, true, { interaction: request });
      }
      await runtime.deletePendingReconcile(binding.workId);
      await runtime.clearWorktreeBinding(binding.worktreeId);
      await runtime.clearSessionBindingsForWorktree(binding.worktreeId);
    }

    // Returning to design is an explicit BLOCK phase transition. Persist it in the
    // interaction itself so host renderers never need to infer resolution readiness
    // from session/worktree side effects. The blocker remains pending.
    const transitioned: InteractionRequest = {
      ...request,
      context: { ...(request.context ?? {}), blockPhase: "design" },
    };
    await runtime.savePendingInteraction(transitioned);
    return {
      interaction: transitioned,
      ...(binding ? { releasedWorkId: binding.workId, releasedTargetArtifactId: binding.targetArtifactId } : {}),
      ...(blockedChangeId ? { changeId: blockedChangeId } : {}),
      blockerStillActive: true,
    };
  }
}
