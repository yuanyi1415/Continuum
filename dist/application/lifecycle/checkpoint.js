export class LifecycleCheckpoint {
    git;
    storeFactory;
    runtimeFactory;
    reconcileWork;
    constructor(git, storeFactory, runtimeFactory, reconcileWork) {
        this.git = git;
        this.storeFactory = storeFactory;
        this.runtimeFactory = runtimeFactory;
        this.reconcileWork = reconcileWork;
    }
    async execute(cwd, input) {
        const facts = await this.git.inspect(cwd);
        const store = this.storeFactory(facts.root);
        await store.loadProject();
        const runtime = this.runtimeFactory(facts.root);
        const health = await runtime.health();
        if (!health.available)
            return { status: "UNMANAGED", source: input.source };
        if (input.sessionId && input.host && await runtime.isSessionSuppressed(input.sessionId, input.host)) {
            return { status: "SUPPRESSED", source: input.source };
        }
        const binding = await runtime.getWorktreeBinding(facts.worktreeIdentity);
        if (!binding)
            return { status: "UNMANAGED", source: input.source };
        const reconcile = await this.reconcileWork.execute(cwd);
        if (reconcile.status === "NOOP")
            return { status: "NOOP", source: input.source, reconcile };
        return { status: "RECONCILED", source: input.source, reconcile };
    }
}
//# sourceMappingURL=checkpoint.js.map