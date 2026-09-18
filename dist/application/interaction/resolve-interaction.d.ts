import type { InteractionResult } from "../../domain/interaction/interaction.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
import type { BindWork } from "../work/bind-work.js";
import type { ResolveBlock } from "./resolve-block.js";
export interface ResolveInteractionInput {
    interactionId: string;
    host: string;
    sessionId?: string;
    action?: "accept" | "cancel" | "dismiss" | "unavailable" | "resolve";
    selectedOption?: string;
}
export interface ResolveInteractionResult extends InteractionResult {
    restartedWork?: {
        targetArtifactId: string;
        workId: string;
        workStartRevision: string;
    };
}
export declare class ResolveInteraction {
    private readonly git;
    private readonly storeFactory;
    private readonly runtimeFactory;
    private readonly clock;
    private readonly bindWork?;
    private readonly resolveBlock?;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, runtimeFactory: (root: string) => RuntimeStorePort, clock: ClockPort, bindWork?: BindWork | undefined, resolveBlock?: ResolveBlock | undefined);
    execute(cwd: string, input: ResolveInteractionInput): Promise<ResolveInteractionResult>;
}
