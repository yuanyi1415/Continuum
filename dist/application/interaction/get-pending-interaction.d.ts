import type { InteractionRequest } from "../../domain/interaction/interaction.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
export declare class GetPendingInteraction {
    private readonly git;
    private readonly storeFactory;
    private readonly runtimeFactory;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, runtimeFactory: (root: string) => RuntimeStorePort);
    execute(cwd: string, preferredType?: "DECISION" | "BLOCK"): Promise<InteractionRequest | null>;
}
