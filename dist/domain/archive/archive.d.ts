import type { ArtifactType } from "../artifact/artifact-ref.js";
export type ArchiveStatus = "complete" | "incomplete";
export type ArchiveMaterializationStatus = "materialized" | "external" | "missing" | "unsupported";
export interface ArchiveArtifactEntry {
    artifactId: string;
    type: ArtifactType;
    authority: string;
    locator: string;
    registeredVersion?: string;
    finalVersion?: string;
    materializedPath?: string;
    sha256?: string;
    status: ArchiveMaterializationStatus;
}
export interface ArchiveChangeEntry {
    changeId: string;
    title: string;
    status: "closed" | "superseded";
    createdAt: string;
    closedAt?: string;
    supersededBy?: string;
}
export interface ArchiveManifest {
    schemaVersion: 1;
    archiveId: string;
    status: ArchiveStatus;
    projectId: string;
    projectName: string;
    projectCreatedAt: string;
    createdAt: string;
    finalSnapshot: string;
    repository: {
        identity: string;
        revision: string;
    };
    changes: ArchiveChangeEntry[];
    artifacts: ArchiveArtifactEntry[];
    missingOrExternal: string[];
    continuumPath: string;
    sourceSnapshotPath: string;
    historyBundlePath?: string;
    checksumsPath: string;
}
export declare function assertArchiveManifestInvariant(value: ArchiveManifest): void;
