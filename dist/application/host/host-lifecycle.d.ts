import type { InteractionRequest } from "../../domain/interaction/interaction.js";
import type { BindWork } from "../work/bind-work.js";
import type { GetCurrentWork } from "../work/get-current-work.js";
import type { LifecycleCheckpoint, LifecycleCheckpointResult } from "../lifecycle/checkpoint.js";
import type { RouteContext } from "../context/route-context.js";
import type { GetPendingInteraction } from "../interaction/get-pending-interaction.js";
import type { ResolveInteraction } from "../interaction/resolve-interaction.js";
import type { ReturnToDesign } from "../interaction/return-to-design.js";
import type { ResolveBlock } from "../interaction/resolve-block.js";
export type HostLifecycleEvent = "SESSION_START" | "USER_PROMPT" | "STABLE_CHECKPOINT" | "SESSION_END";
export interface HostLifecycleSignal {
    host: string;
    event: HostLifecycleEvent;
    sessionId: string;
    cwd: string;
    prompt?: string;
    source: string;
}
export interface HostLifecycleResult {
    state: "SILENT" | "MANAGED" | "DECISION" | "DECISION_MCP" | "BLOCKED";
    targetArtifactId?: string;
    contextSummary?: string;
    interaction?: InteractionRequest;
    checkpoint?: LifecycleCheckpointResult;
    decisionResolved?: {
        interactionId: string;
        optionId: string;
    };
    blockTransition?: {
        interactionId: string;
        action: "returned_to_design" | "resolved";
    };
}
export declare function parseExplicitWorkIntent(prompt: string): string | null;
export declare class HandleHostLifecycle {
    private readonly currentWork;
    private readonly bindWork;
    private readonly checkpoint;
    private readonly context;
    private readonly pendingInteraction;
    private readonly resolveInteraction;
    private readonly returnToDesign;
    private readonly resolveBlock;
    constructor(currentWork: GetCurrentWork, bindWork: BindWork, checkpoint: LifecycleCheckpoint, context: RouteContext, pendingInteraction: GetPendingInteraction, resolveInteraction: ResolveInteraction, returnToDesign: ReturnToDesign, resolveBlock: ResolveBlock);
    private summary;
    execute(signal: HostLifecycleSignal): Promise<HostLifecycleResult>;
}
