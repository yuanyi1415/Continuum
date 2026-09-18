import type { ArtifactType } from "../artifact/artifact-ref.js";

export type ContextPriority = "P0" | "P1" | "P2" | "P3";

export interface ContextManifestItem {
  artifactId: string;
  type: ArtifactType;
  locator: string;
  title?: string;
  version?: string;
  reason: string;
  priority: ContextPriority;
}

export interface ContextManifest {
  workId: string;
  generatedAt: string;
  required: ContextManifestItem[];
  optional: ContextManifestItem[];
  excludedHistorical: string[];
  warnings: string[];
}
