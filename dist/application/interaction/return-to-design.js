import { ContinuumError } from "../../shared/errors/continuum-error.js";
function stringContext(request, key) {
    const value = request.context?.[key];
    return typeof value === "string" && value.trim() ? value : undefined;
}
export class ReturnToDesign {
    git;
    storeFactory;
    runtimeFactory;
    constructor(git, storeFactory, runtimeFactory) {
        this.git = git;
        this.storeFactory = storeFactory;
        this.runtimeFactory = runtimeFactory;
    }
    async execute(cwd, input) {
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
        const transitioned = {
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
//# sourceMappingURL=return-to-design.js.map