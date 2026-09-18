import type { HostLifecycleResult, HostLifecycleSignal } from "../../../application/host/host-lifecycle.js";
export type OmpExtensionEventName = "session_start" | "before_agent_start" | "session_stop" | "session_shutdown";
export interface OmpExtensionPayload {
    event_name?: string;
    cwd?: string;
    session_id?: string;
    prompt?: string;
    has_ui?: boolean;
    [key: string]: unknown;
}
export interface OmpExtensionResponse {
    state: HostLifecycleResult["state"];
    targetArtifactId?: string;
    contextSummary?: string;
    interaction?: HostLifecycleResult["interaction"];
    checkpoint?: HostLifecycleResult["checkpoint"];
    decisionResolved?: HostLifecycleResult["decisionResolved"];
    blockTransition?: HostLifecycleResult["blockTransition"];
}
export declare function decodeOmpEvent(payload: OmpExtensionPayload, defaultCwd: string): HostLifecycleSignal | null;
export declare function encodeOmpEvent(result: HostLifecycleResult): OmpExtensionResponse;
