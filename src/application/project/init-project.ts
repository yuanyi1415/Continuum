import { basename } from "node:path";
import type { Project } from "../../domain/project/project.js";
import { assertProjectInvariant } from "../../domain/project/project.js";
import type { CurrentPointer, Snapshot } from "../../domain/snapshot/snapshot.js";
import { assertSnapshotInvariant } from "../../domain/snapshot/snapshot.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { IdGeneratorPort } from "../../ports/id-generator.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
import type { RepositoryFilesPort } from "../../ports/repository-files.js";

export interface InitProjectResult { project: Project; snapshot: Snapshot; current: CurrentPointer; repositoryRoot: string; }

export class InitProject {
  constructor(private readonly git: GitPort, private readonly storeFactory: (root: string) => ProjectStorePort,
    private readonly runtimeFactory: (root: string) => RuntimeStorePort, private readonly repositoryFiles: RepositoryFilesPort,
    private readonly clock: ClockPort, private readonly ids: IdGeneratorPort) {}
  async execute(cwd: string, name?: string): Promise<InitProjectResult> {
    const facts = await this.git.inspect(cwd); const store = this.storeFactory(facts.root); const now = this.clock.nowIso();
    const projectId = this.ids.next("prj"), snapshotId = this.ids.next("snap");
    const project: Project = { schemaVersion: 1, projectId, name: name?.trim() || basename(facts.root), createdAt: now, repository: { identity: facts.repositoryIdentity } };
    const snapshot: Snapshot = { schemaVersion: 1, snapshotId, projectId, createdAt: now, baselines: [{ repositoryIdentity: facts.repositoryIdentity, revision: facts.currentRevision }], activeChanges: [], blockers: [] };
    const current: CurrentPointer = { schemaVersion: 1, projectId, snapshotId, updatedAt: now };
    assertProjectInvariant(project); assertSnapshotInvariant(snapshot);
    await store.initialize(project, snapshot, current);
    await this.repositoryFiles.ensureContinuumLocalIgnored(facts.root);
    await this.runtimeFactory(facts.root).initialize();
    return { project, snapshot, current, repositoryRoot: facts.root };
  }
}
