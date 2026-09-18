import { ContinuumError } from "../../shared/errors/continuum-error.js";
export class ResolveBlock {
    git;
    storeFactory;
    runtimeFactory;
    clock;
    constructor(git, storeFactory, runtimeFactory, clock) {
        this.git = git;
        this.storeFactory = storeFactory;
        this.runtimeFactory = runtimeFactory;
        this.clock = clock;
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
        const blockPhase = request.context?.blockPhase;
        if (blockPhase !== "design") {
            throw new ContinuumError("CONTINUUM_BLOCKED", "Return to design before resolving the BLOCK; the blocker has not entered design-review phase.", true, { interaction: request });
        }
        const binding = await runtime.getWorktreeBinding(facts.worktreeIdentity);
        if (binding) {
            throw new ContinuumError("CONTINUUM_BLOCKED", "Return to design before resolving the BLOCK; managed implementation work is still bound to this worktree.", true, { interaction: request, binding });
        }
        const result = {
            requestId: request.id,
            action: "resolve",
            host: input.host,
            resolvedAt: this.clock.nowIso(),
        };
        await runtime.resolveInteraction(result);
        return result;
    }
}
//# sourceMappingURL=resolve-block.js.map