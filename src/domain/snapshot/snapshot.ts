export interface RepositoryBaseline {
  repositoryIdentity: string;
  revision: string;
}

export interface Snapshot {
  schemaVersion: 1;
  snapshotId: string;
  projectId: string;
  createdAt: string;
  baselines: RepositoryBaseline[];
  stage?: string;
  activeChanges: string[];
  blockers: string[];
  nextGate?: string;
  lastReconcile?: string;
}

export interface CurrentPointer {
  schemaVersion: 1;
  projectId: string;
  snapshotId: string;
  updatedAt: string;
}

export function assertSnapshotInvariant(snapshot: Snapshot): void {
  if (!snapshot.snapshotId.startsWith("snap_")) throw new Error("snapshotId must start with snap_");
  if (snapshot.baselines.length < 1) throw new Error("snapshot requires at least one repository baseline");
  for (const baseline of snapshot.baselines) {
    if (!baseline.repositoryIdentity.trim()) throw new Error("repository baseline identity cannot be empty");
    if (!/^[0-9a-f]{40,64}$/i.test(baseline.revision)) throw new Error("repository revision must be a full git object id");
  }
}
