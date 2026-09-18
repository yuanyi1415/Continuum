import type { ArtifactType } from "../domain/artifact/artifact-ref.js";
export interface ObservedMattArtifact {
    artifactId: string;
    type: ArtifactType;
    locator: string;
    title?: string;
}
export interface MattArtifactObserverPort {
    observe(): Promise<ObservedMattArtifact[]>;
}
