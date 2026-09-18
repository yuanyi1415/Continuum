import type { MattArtifactObserverPort, ObservedMattArtifact } from "../../ports/matt-artifact-observer.js";
export declare class LocalMattArtifactObserver implements MattArtifactObserverPort {
    private readonly repositoryRoot;
    constructor(repositoryRoot: string);
    observe(): Promise<ObservedMattArtifact[]>;
}
