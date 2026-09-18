import type { GitPort } from "../../ports/git.js";
import type { MattArtifactObserverPort, ObservedMattArtifact } from "../../ports/matt-artifact-observer.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RegisterArtifact } from "../artifact/register-artifact.js";
import type { RegisterRelation } from "../relation/register-relation.js";
export interface ScanMattArtifactsResult {
    discovered: ObservedMattArtifact[];
    registered: string[];
    existing: string[];
    linkedToChange: string[];
}
export declare class ScanMattArtifacts {
    private readonly git;
    private readonly storeFactory;
    private readonly observerFactory;
    private readonly registerArtifact;
    private readonly registerRelation;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, observerFactory: (root: string) => MattArtifactObserverPort, registerArtifact: RegisterArtifact, registerRelation: RegisterRelation);
    execute(cwd: string, changeId?: string): Promise<ScanMattArtifactsResult>;
}
