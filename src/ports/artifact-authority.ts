import type { ArtifactRef } from "../domain/artifact/artifact-ref.js";

export interface ResolvedArtifact {
  ref: ArtifactRef;
  version?: string;
  content?: string;
  exists: boolean;
}

export interface ArtifactAuthorityPort {
  resolve(ref: ArtifactRef): Promise<ResolvedArtifact>;
  exists(ref: ArtifactRef): Promise<boolean>;
  getVersion(ref: ArtifactRef): Promise<string | undefined>;
  getVersionAtRevision(ref: ArtifactRef, revision: string): Promise<string | undefined>;
}
