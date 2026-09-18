import type { InteractionResult } from "../../domain/interaction/interaction.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
export interface ResolveBlockInput {
    interactionId: string;
    host: string;
}
export declare class ResolveBlock {
    private readonly git;
    private readonly storeFactory;
    private readonly runtimeFactory;
    private readonly clock;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, runtimeFactory: (root: string) => RuntimeStorePort, clock: ClockPort);
    execute(cwd: string, input: ResolveBlockInput): Promise<InteractionResult>;
}
