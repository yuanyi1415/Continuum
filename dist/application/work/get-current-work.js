export class GetCurrentWork {
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
    async execute(cwd, input = {}) {
        const facts = await this.git.inspect(cwd);
        const store = this.storeFactory(facts.root);
        await store.loadProject();
        const runtime = this.runtimeFactory(facts.root);
        const health = await runtime.health();
        if (!health.available)
            return { mode: "aware", suppressed: false, binding: null, sessionBound: false };
        const binding = await runtime.getWorktreeBinding(facts.worktreeIdentity);
        if (!input.sessionId || !input.host)
            return { mode: binding ? "managed" : "aware", suppressed: false, binding, sessionBound: false };
        const suppressed = await runtime.isSessionSuppressed(input.sessionId, input.host);
        if (suppressed)
            return { mode: "aware", suppressed: true, binding, sessionBound: false };
        if (!binding)
            return { mode: "aware", suppressed: false, binding: null, sessionBound: false };
        await runtime.bindSession({ sessionId: input.sessionId, host: input.host, worktreeId: facts.worktreeIdentity, boundAt: this.clock.nowIso() });
        return { mode: "managed", suppressed: false, binding, sessionBound: true };
    }
}
//# sourceMappingURL=get-current-work.js.map