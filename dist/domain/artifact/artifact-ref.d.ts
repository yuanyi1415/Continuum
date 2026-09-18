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
export declare function assertArtifactRefInvariant(artifact: ArtifactRef): void;
