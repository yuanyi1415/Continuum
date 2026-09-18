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
export declare function assertSnapshotInvariant(snapshot: Snapshot): void;
