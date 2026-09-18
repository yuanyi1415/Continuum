import type { HostLifecycleResult, HostLifecycleSignal } from "../../../application/host/host-lifecycle.js";
export interface CodexHookPayload {
    hook_event_name?: string;
    cwd?: string;
    session_id?: string;
    turn_id?: string;
    prompt?: string;
    [key: string]: unknown;
}
export interface CodexHookResponse {
    continue: boolean;
    suppressOutput?: boolean;
    decision?: "block";
    reason?: string;
    systemMessage?: string;
    hookSpecificOutput?: {
        hookEventName: string;
        additionalContext?: string;
    };
}
export declare function decodeCodexHook(payload: CodexHookPayload, defaultCwd: string): HostLifecycleSignal | null;
export declare function encodeCodexHook(payload: CodexHookPayload, result: HostLifecycleResult): CodexHookResponse;
