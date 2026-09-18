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

function eventName(payload: CodexHookPayload): string { return String(payload.hook_event_name ?? ""); }

export function decodeCodexHook(payload: CodexHookPayload, defaultCwd: string): HostLifecycleSignal | null {
  const event = eventName(payload);
  const sessionId = String(payload.session_id ?? "").trim();
  const cwd = String(payload.cwd ?? defaultCwd).trim() || defaultCwd;
  if (!sessionId) return null;
  if (event === "SessionStart") return { host:"codex", event:"SESSION_START", sessionId, cwd, source:"codex:SessionStart" };
  if (event === "UserPromptSubmit") return { host:"codex", event:"USER_PROMPT", sessionId, cwd, prompt:String(payload.prompt ?? ""), source:"codex:UserPromptSubmit" };
  if (event === "Stop") return { host:"codex", event:"STABLE_CHECKPOINT", sessionId, cwd, source:"codex:Stop" };
  if (event === "SessionEnd") return { host:"codex", event:"SESSION_END", sessionId, cwd, source:"codex:SessionEnd" };
  return null;
}

function formatDecision(result: HostLifecycleResult): string {
  const interaction = result.interaction!;
  const options = interaction.options ?? [];
  const lines = options.map((option,index)=>`${index+1}. ${option.label}${option.description ? ` — ${option.description}` : ""}`);
  return [interaction.title, interaction.message ?? interaction.reason ?? "Continuum needs a decision.", ...lines, "Reply with the option number or option id."].filter(Boolean).join("\n\n");
}

export function encodeCodexHook(payload: CodexHookPayload, result: HostLifecycleResult): CodexHookResponse {
  const hookEventName = eventName(payload) || "UserPromptSubmit";
  if (result.blockTransition) {
    const message = result.blockTransition.action === "returned_to_design"
      ? "Continuum released the current Work and returned this worktree to design. The blocker remains active until explicitly resolved."
      : "Continuum blocker resolved. Formal Work may be bound again.";
    return { continue:false, decision:"block", reason:message, hookSpecificOutput:{hookEventName} };
  }
  if (result.state === "BLOCKED") {
    const interaction = result.interaction!;
    return { continue:false, decision:"block", reason:[interaction.title,interaction.message ?? interaction.reason ?? "Continuum blocked this work."].filter(Boolean).join("\n\n"), hookSpecificOutput:{hookEventName} };
  }
  if (result.state === "DECISION") {
    return { continue:false, decision:"block", reason:`${formatDecision(result)}\n\nFor Codex native structured UI, send: continuum decision`, hookSpecificOutput:{hookEventName, additionalContext:"Continuum decision gate is deterministic; do not choose on the user's behalf."} };
  }
  if (result.state === "DECISION_MCP") {
    return { continue:true, suppressOutput:true, hookSpecificOutput:{hookEventName, additionalContext:`A blocking Continuum decision (${result.interaction?.id ?? "pending"}) is pending. Before any other action, call the MCP tool continuum_decision and let the user choose. Do not choose on the user's behalf.`} };
  }
  if (result.state === "MANAGED") {
    return { continue:true, suppressOutput:true, hookSpecificOutput:{hookEventName, additionalContext:result.contextSummary ?? `Continuum managed work: ${result.targetArtifactId ?? "unknown"}.`} };
  }
  if (result.decisionResolved) {
    return { continue:true, suppressOutput:true, hookSpecificOutput:{hookEventName, additionalContext:`Continuum decision resolved: ${result.decisionResolved.optionId}.`} };
  }
  return { continue:true, suppressOutput:true };
}
