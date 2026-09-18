import type { InteractionRequest } from "../../domain/interaction/interaction.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
export interface ReturnToDesignInput {
    interactionId: string;
    sessionId?: string;
    host?: string;
}
export interface ReturnToDesignResult {
    interaction: InteractionRequest;
    releasedWorkId?: string;
    releasedTargetArtifactId?: string;
    changeId?: string;
    blockerStillActive: true;
}
export declare class ReturnToDesign {
    private readonly git;
    private readonly storeFactory;
    private readonly runtimeFactory;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, runtimeFactory: (root: string) => RuntimeStorePort);
    execute(cwd: string, input: ReturnToDesignInput): Promise<ReturnToDesignResult>;
}
