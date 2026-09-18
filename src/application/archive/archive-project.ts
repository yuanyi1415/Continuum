import type { ArchiveCreateResult, ArchivePort } from "../../ports/archive.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { IdGeneratorPort } from "../../ports/id-generator.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";

export interface ArchiveProjectInput {
  allowIncomplete?: boolean;
  withHistory?: boolean;
}

export class ArchiveProject {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root: string) => ProjectStorePort,
    private readonly archive: ArchivePort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  async execute(cwd: string, input: ArchiveProjectInput = {}): Promise<ArchiveCreateResult> {
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    const project = await store.loadProject();
    const current = await store.loadCurrent();
    const finalSnapshot = await store.loadSnapshot(current.snapshotId);
    const changes = await store.listChanges();
    const artifacts = await store.listArtifacts();

    const activeChanges = changes.filter(change => change.status === "active");
    if (activeChanges.length || finalSnapshot.activeChanges.length) {
      throw new ContinuumError(
        "CONTINUUM_ARCHIVE_NOT_READY",
        "Project Archive requires all Changes to be closed or superseded.",
        true,
        { activeChanges: activeChanges.map(change => change.changeId), snapshotActiveChanges: finalSnapshot.activeChanges },
      );
    }
    if (finalSnapshot.blockers.length) {
      throw new ContinuumError("CONTINUUM_ARCHIVE_NOT_READY", "Project Archive requires a final Snapshot without blockers.", true, { blockers: finalSnapshot.blockers });
    }

    const baseline = finalSnapshot.baselines.find(item => item.repositoryIdentity === project.repository.identity);
    if (!baseline) {
      throw new ContinuumError(
        "CONTINUUM_ARCHIVE_NOT_READY",
        "Final Snapshot does not contain a baseline for the Project repository identity.",
        false,
        { repositoryIdentity: project.repository.identity, baselines: finalSnapshot.baselines },
      );
    }
    if (!(await this.git.isAncestor(facts.root, baseline.revision, facts.currentRevision))) {
      throw new ContinuumError(
        "CONTINUUM_ARCHIVE_NOT_READY",
        "Final Snapshot revision is not reachable from the current repository; refusing to materialize an ambiguous archive.",
        false,
        { finalRevision: baseline.revision, currentRevision: facts.currentRevision },
      );
    }

    return this.archive.create(facts.root, {
      archiveId: this.ids.next("archive"),
      createdAt: this.clock.nowIso(),
      project,
      current,
      finalSnapshot,
      finalRevision: baseline.revision,
      changes,
      artifacts,
      allowIncomplete: input.allowIncomplete ?? false,
      withHistory: input.withHistory ?? false,
    });
  }
}
