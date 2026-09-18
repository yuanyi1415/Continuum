export type ArtifactType = "context" | "adr" | "spec" | "ticket" | "review" | "evidence" | "document" | "other";

export interface ArtifactRef {
  schemaVersion: 1;
  artifactId: string;
  type: ArtifactType;
  authority: string;
  locator: string;
  version?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

const ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function assertArtifactRefInvariant(artifact: ArtifactRef): void {
  if (!ARTIFACT_ID.test(artifact.artifactId)) throw new Error("artifactId contains unsupported characters");
  if (!artifact.authority.trim()) throw new Error("artifact authority cannot be empty");
  if (!artifact.locator.trim()) throw new Error("artifact locator cannot be empty");
  if (artifact.locator.includes("\0")) throw new Error("artifact locator contains NUL");
}
