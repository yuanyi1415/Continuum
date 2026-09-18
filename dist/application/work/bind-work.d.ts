import type { WorkBinding } from "../../domain/work/work-binding.js";
import type { ArtifactAuthorityPort } from "../../ports/artifact-authority.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { IdGeneratorPort } from "../../ports/id-generator.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
export interface BindWorkInput {
    targetArtifactId: string;
    bindingSource?: string;
    sessionId?: string;
    host?: string;
}
export interface BindWorkResult {
    binding: WorkBinding;
    created: boolean;
    sessionBound: boolean;
}
export declare class BindWork {
    private readonly git;
    private readonly storeFactory;
    private readonly runtimeFactory;
    private readonly authorityFactory;
    private readonly clock;
    private readonly ids;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, runtimeFactory: (root: string) => RuntimeStorePort, authorityFactory: (root: string) => ArtifactAuthorityPort, clock: ClockPort, ids: IdGeneratorPort);
    private designChanges;
    private restartDecision;
    execute(cwd: string, input: BindWorkInput): Promise<BindWorkResult>;
}
