import { ContinuumError } from "../../shared/errors/continuum-error.js";
export class ResolveInteraction {
    git;
    storeFactory;
    runtimeFactory;
    clock;
    bindWork;
    resolveBlock;
    constructor(git, storeFactory, runtimeFactory, clock, bindWork, resolveBlock) {
        this.git = git;
        this.storeFactory = storeFactory;
        this.runtimeFactory = runtimeFactory;
        this.clock = clock;
        this.bindWork = bindWork;
        this.resolveBlock = resolveBlock;
    }
    async execute(cwd, input) {
        const facts = await this.git.inspect(cwd);
        const store = this.storeFactory(facts.root);
        await store.loadProject();
        const runtime = this.runtimeFactory(facts.root);
        const request = await runtime.loadPendingInteraction(input.interactionId);
        if (!request)
            throw new ContinuumError("CONTINUUM_INTERACTION_NOT_FOUND", `Pending interaction not found: ${input.interactionId}`, true);
        const action = input.action ?? "accept";
        if (action === "accept" && request.type === "DECISION") {
            if (!input.selectedOption)
                throw new ContinuumError("CONTINUUM_DECISION_REQUIRED", "A selected option is required to resolve this decision.", true, { interaction: request });
            const allowed = new Set((request.options ?? []).map(option => option.id));
            if (!allowed.has(input.selectedOption))
                throw new ContinuumError("CONTINUUM_DECISION_REQUIRED", `Invalid decision option: ${input.selectedOption}`, true, { interaction: request });
        }
        if (request.type === "BLOCK" && action !== "resolve") {
            throw new ContinuumError("CONTINUUM_BLOCKED", "BLOCK interactions cannot be accepted, dismissed, or cancelled away. Return to design, resolve the underlying conflict, then explicitly resolve the block.", true, { interaction: request });
        }
        const isRestartDecision = request.type === "DECISION" && request.context?.kind === "restart-blocked-work";
        if (isRestartDecision && action === "accept" && input.selectedOption === "restart-work") {
            if (!this.bindWork || !this.resolveBlock)
                throw new ContinuumError("CONTINUUM_RUNTIME_CORRUPT", "Restart decision dependencies are unavailable.");
            const blockInteractionId = String(request.context?.blockInteractionId ?? "");
            const targetArtifactId = String(request.context?.targetArtifactId ?? "");
            if (!blockInteractionId || !targetArtifactId)
                throw new ContinuumError("CONTINUUM_RUNTIME_CORRUPT", "Restart decision is missing BLOCK or Work context.");
            const block = await runtime.loadPendingInteraction(blockInteractionId);
            if (!block || block.type !== "BLOCK" || block.context?.blockPhase !== "design") {
                throw new ContinuumError("CONTINUUM_BLOCKED", "The design conflict is no longer in a restartable design phase.", true, { interaction: block ?? request });
            }
            // User confirmation is the semantic boundary: resolve the design conflict,
            // then start a new Work with a fresh baseline. If binding fails, restore the
            // BLOCK so project safety never depends on a half-completed restart.
            await this.resolveBlock.execute(cwd, { interactionId: blockInteractionId, host: input.host });
            try {
                const bound = await this.bindWork.execute(cwd, {
                    targetArtifactId,
                    bindingSource: `${input.host}:restart-after-design`,
                    ...(input.sessionId ? { sessionId: input.sessionId, host: input.host } : {}),
                });
                const result = {
                    requestId: request.id,
                    action,
                    selectedOption: input.selectedOption,
                    host: input.host,
                    resolvedAt: this.clock.nowIso(),
                    restartedWork: {
                        targetArtifactId: bound.binding.targetArtifactId,
                        workId: bound.binding.workId,
                        workStartRevision: bound.binding.workStartRevision,
                    },
                };
                await runtime.resolveInteraction(result);
                return result;
            }
            catch (error) {
                await runtime.savePendingInteraction(block);
                throw error;
            }
        }
        const result = {
            requestId: request.id,
            action,
            ...(input.selectedOption ? { selectedOption: input.selectedOption } : {}),
            host: input.host,
            resolvedAt: this.clock.nowIso(),
        };
        await runtime.resolveInteraction(result);
        return result;
    }
}
//# sourceMappingURL=resolve-interaction.js.map