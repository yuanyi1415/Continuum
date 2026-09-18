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
  repository: { identity: string; revision: string };
  changes: ArchiveChangeEntry[];
  artifacts: ArchiveArtifactEntry[];
  missingOrExternal: string[];
  continuumPath: string;
  sourceSnapshotPath: string;
  historyBundlePath?: string;
  checksumsPath: string;
}

export function assertArchiveManifestInvariant(value: ArchiveManifest): void {
  if (!value.archiveId.startsWith("archive_")) throw new Error("archiveId must start with archive_");
  if (!value.projectId.startsWith("prj_")) throw new Error("projectId must start with prj_");
  if (!value.finalSnapshot.startsWith("snap_")) throw new Error("finalSnapshot must start with snap_");
  if (!/^[0-9a-f]{40,64}$/i.test(value.repository.revision)) throw new Error("archive repository revision must be a full Git revision");
  if (!Number.isFinite(Date.parse(value.createdAt))) throw new Error("archive createdAt must be ISO-8601");
  if (value.status === "complete" && value.artifacts.some(item => item.status === "missing" || item.status === "external")) {
    throw new Error("complete archive cannot contain missing/external required artifacts");
  }
}
