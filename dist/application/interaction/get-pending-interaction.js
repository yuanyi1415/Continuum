export class GetPendingInteraction {
    git;
    storeFactory;
    runtimeFactory;
    constructor(git, storeFactory, runtimeFactory) {
        this.git = git;
        this.storeFactory = storeFactory;
        this.runtimeFactory = runtimeFactory;
    }
    async execute(cwd, preferredType) {
        const facts = await this.git.inspect(cwd);
        const store = this.storeFactory(facts.root);
        await store.loadProject();
        const runtime = this.runtimeFactory(facts.root);
        const health = await runtime.health();
        if (!health.available)
            return null;
        const pending = await runtime.listPendingInteractions();
        const rank = (item) => item.type === "BLOCK" ? 0 : item.type === "DECISION" ? 1 : 2;
        const filtered = preferredType ? pending.filter(item => item.type === preferredType) : pending.filter(item => item.type === "BLOCK" || item.type === "DECISION");
        return filtered.sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0] ?? null;
    }
}
//# sourceMappingURL=get-pending-interaction.js.map