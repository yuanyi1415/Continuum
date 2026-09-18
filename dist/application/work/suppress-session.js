import { ContinuumError } from "../../shared/errors/continuum-error.js";
export class SuppressSession {
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
        await runtime.initialize();
        const binding = await runtime.getWorktreeBinding(facts.worktreeIdentity);
        if (binding) {
            const block = (await runtime.listPendingInteractions()).find(interaction => {
                if (interaction.type !== "BLOCK")
                    return false;
                const changeId = interaction.context?.changeId;
                if (typeof changeId === "string" && binding.changeId)
                    return changeId === binding.changeId;
                const affectedTickets = interaction.context?.affectedTickets;
                return Array.isArray(affectedTickets) && affectedTickets.includes(binding.targetArtifactId);
            });
            if (block) {
                throw new ContinuumError("CONTINUUM_BLOCKED", "This managed Work is blocked. Return to design before suppressing Continuum; suppression cannot bypass a project BLOCK.", true, { interaction: block });
            }
        }
        await runtime.suppressSession({ sessionId: input.sessionId, host: input.host, suppressedAt: this.clock.nowIso(), ...(input.reason ? { reason: input.reason } : {}) });
    }
}
//# sourceMappingURL=suppress-session.js.map