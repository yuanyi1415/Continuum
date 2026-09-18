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

export function decodeOmpEvent(payload: OmpExtensionPayload, defaultCwd: string): HostLifecycleSignal | null {
  const event = String(payload.event_name ?? "") as OmpExtensionEventName;
  const sessionId = String(payload.session_id ?? "").trim();
  const cwd = String(payload.cwd ?? defaultCwd).trim() || defaultCwd;
  if (!sessionId) return null;
  if (event === "session_start") return { host:"omp", event:"SESSION_START", sessionId, cwd, source:"omp:session_start" };
  if (event === "before_agent_start") return { host:"omp", event:"USER_PROMPT", sessionId, cwd, prompt:String(payload.prompt ?? ""), source:"omp:before_agent_start" };
  if (event === "session_stop") return { host:"omp", event:"STABLE_CHECKPOINT", sessionId, cwd, source:"omp:session_stop" };
  if (event === "session_shutdown") return { host:"omp", event:"SESSION_END", sessionId, cwd, source:"omp:session_shutdown" };
  return null;
}

export function encodeOmpEvent(result: HostLifecycleResult): OmpExtensionResponse {
  return {
    state: result.state,
    ...(result.targetArtifactId ? { targetArtifactId:result.targetArtifactId } : {}),
    ...(result.contextSummary ? { contextSummary:result.contextSummary } : {}),
    ...(result.interaction ? { interaction:result.interaction } : {}),
    ...(result.checkpoint ? { checkpoint:result.checkpoint } : {}),
    ...(result.decisionResolved ? { decisionResolved:result.decisionResolved } : {}),
    ...(result.blockTransition ? { blockTransition:result.blockTransition } : {}),
  };
}
