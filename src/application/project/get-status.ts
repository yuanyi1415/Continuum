import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";

export interface ProjectStatus {
  project: { projectId: string; name: string; repositoryIdentity: string };
  current: { snapshotId: string; revision: string; stage?: string; activeChanges: string[]; blockers: string[] };
  changes: { active: Array<{ changeId: string; title: string; specRefs: string[]; ticketRefs: string[] }> };
  runtime: { available: boolean; schemaVersion?: number; driver?: string; error?: string };
  work: { mode: "aware" | "managed"; binding: null | { workId: string; targetArtifactId: string; changeId?: string; workStartRevision: string; worktreeId: string } };
  git: { root: string; head: string; baselineMatchesHead: boolean };
}
export class GetStatus {
  constructor(private readonly git: GitPort, private readonly storeFactory: (root: string)=>ProjectStorePort, private readonly runtimeFactory:(root:string)=>RuntimeStorePort) {}
  async execute(cwd: string): Promise<ProjectStatus> {
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
      work: { mode: binding ? "managed" : "aware", binding: binding ? { workId:binding.workId, targetArtifactId:binding.targetArtifactId, changeId:binding.changeId, workStartRevision:binding.workStartRevision, worktreeId:binding.worktreeId } : null },
      git: { root: facts.root, head: facts.currentRevision, baselineMatchesHead: baseline.revision === facts.currentRevision },
    };
  }
}
