export class GetStatus {
    git;
    storeFactory;
    runtimeFactory;
    constructor(git, storeFactory, runtimeFactory) {
        this.git = git;
        this.storeFactory = storeFactory;
        this.runtimeFactory = runtimeFactory;
    }
    async execute(cwd) {
        const facts = await this.git.inspect(cwd);
        const store = this.storeFactory(facts.root);
        const project = await store.loadProject();
        const current = await store.loadCurrent();
        const snapshot = await store.loadSnapshot(current.snapshotId);
        const baseline = snapshot.baselines.find(b => b.repositoryIdentity === project.repository.identity) ?? snapshot.baselines[0];
        const activeChanges = (await store.listChanges()).filter(change => change.status === "active");
        const runtimeStore = this.runtimeFactory(facts.root);
        const runtime = await runtimeStore.health();
        const binding = runtime.available ? await runtimeStore.getWorktreeBinding(facts.worktreeIdentity) : null;
        return {
            project: { projectId: project.projectId, name: project.name, repositoryIdentity: project.repository.identity },
            current: { snapshotId: snapshot.snapshotId, revision: baseline.revision, stage: snapshot.stage, activeChanges: activeChanges.map(change => change.changeId), blockers: snapshot.blockers },
            changes: { active: activeChanges.map(change => ({ changeId: change.changeId, title: change.title, specRefs: change.specRefs, ticketRefs: change.ticketRefs })) },
            runtime,
            work: { mode: binding ? "managed" : "aware", binding: binding ? { workId: binding.workId, targetArtifactId: binding.targetArtifactId, changeId: binding.changeId, workStartRevision: binding.workStartRevision, worktreeId: binding.worktreeId } : null },
            git: { root: facts.root, head: facts.currentRevision, baselineMatchesHead: baseline.revision === facts.currentRevision },
        };
    }
}
//# sourceMappingURL=get-status.js.map