import { basename } from "node:path";
import { assertProjectInvariant } from "../../domain/project/project.js";
import { assertSnapshotInvariant } from "../../domain/snapshot/snapshot.js";
export class InitProject {
    git;
    storeFactory;
    runtimeFactory;
    repositoryFiles;
    clock;
    ids;
    constructor(git, storeFactory, runtimeFactory, repositoryFiles, clock, ids) {
        this.git = git;
        this.storeFactory = storeFactory;
        this.runtimeFactory = runtimeFactory;
        this.repositoryFiles = repositoryFiles;
        this.clock = clock;
        this.ids = ids;
    }
    async execute(cwd, name) {
        const facts = await this.git.inspect(cwd);
        const store = this.storeFactory(facts.root);
        const now = this.clock.nowIso();
        const projectId = this.ids.next("prj"), snapshotId = this.ids.next("snap");
        const project = { schemaVersion: 1, projectId, name: name?.trim() || basename(facts.root), createdAt: now, repository: { identity: facts.repositoryIdentity } };
        const snapshot = { schemaVersion: 1, snapshotId, projectId, createdAt: now, baselines: [{ repositoryIdentity: facts.repositoryIdentity, revision: facts.currentRevision }], activeChanges: [], blockers: [] };
        const current = { schemaVersion: 1, projectId, snapshotId, updatedAt: now };
        assertProjectInvariant(project);
        assertSnapshotInvariant(snapshot);
        await store.initialize(project, snapshot, current);
        await this.repositoryFiles.ensureContinuumLocalIgnored(facts.root);
        await this.runtimeFactory(facts.root).initialize();
        return { project, snapshot, current, repositoryRoot: facts.root };
    }
}
//# sourceMappingURL=init-project.js.map