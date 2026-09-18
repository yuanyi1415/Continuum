import type { ArtifactRef } from "../domain/artifact/artifact-ref.js";
import type { Change } from "../domain/change/change.js";
import type { ArchiveManifest } from "../domain/archive/archive.js";
import type { CurrentPointer, Snapshot } from "../domain/snapshot/snapshot.js";
import type { Project } from "../domain/project/project.js";

export interface ArchiveCreateRequest {
  archiveId: string;
  createdAt: string;
  project: Project;
  current: CurrentPointer;
  finalSnapshot: Snapshot;
  finalRevision: string;
  changes: Change[];
  artifacts: ArtifactRef[];
  allowIncomplete: boolean;
  withHistory: boolean;
}

export interface ArchiveCreateResult {
  archivePath: string;
  manifest: ArchiveManifest;
  verified: boolean;
  checkedFiles: number;
}

export interface ArchiveVerificationResult {
  ok: boolean;
  archivePath: string;
  archiveId?: string;
  status?: "complete" | "incomplete";
  checkedFiles: number;
  failures: string[];
}

export interface ArchivePort {
  create(repositoryRoot: string, input: ArchiveCreateRequest): Promise<ArchiveCreateResult>;
  verify(archivePath: string): Promise<ArchiveVerificationResult>;
}
