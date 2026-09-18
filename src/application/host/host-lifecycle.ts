import type { InteractionRequest } from "../../domain/interaction/interaction.js";
import type { BindWork } from "../work/bind-work.js";
import type { GetCurrentWork } from "../work/get-current-work.js";
import type { LifecycleCheckpoint, LifecycleCheckpointResult } from "../lifecycle/checkpoint.js";
import type { RouteContext } from "../context/route-context.js";
import type { GetPendingInteraction } from "../interaction/get-pending-interaction.js";
import type { ResolveInteraction } from "../interaction/resolve-interaction.js";
import type { ReturnToDesign } from "../interaction/return-to-design.js";
import type { ResolveBlock } from "../interaction/resolve-block.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";

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
  decisionResolved?: { interactionId: string; optionId: string };
  blockTransition?: { interactionId: string; action: "returned_to_design" | "resolved" };
}

export function parseExplicitWorkIntent(prompt: string): string | null {
  // Host adapters may receive transformed user-work text with a lightweight
  // wrapper/prefix. Only accept an explicit implement directive at a line
  // boundary; do not broaden this to natural-language mentions such as
  // "please implement P03".
  const match = prompt.match(/(?:^|\r?\n)[ \t]*\/?implement\s+([A-Za-z0-9][A-Za-z0-9._:-]{0,127})(?=$|[\s,;!?，；！？])/im);
  return match?.[1] ?? null;
}

function requestsNativeDecision(prompt:string):boolean {
  return /^\/?continuum(?:\s+|-)decision$/i.test(prompt.trim());
}

function requestsReturnToDesign(prompt:string):boolean {
  return /^\/?continuum(?:\s+|-)return(?:\s+|-)to(?:\s+|-)design$/i.test(prompt.trim());
}

function requestsResolveBlock(prompt:string):boolean {
  return /^\/?continuum(?:\s+|-)resolve(?:\s+|-)block$/i.test(prompt.trim());
}

function parseDecisionReply(prompt: string, interaction: InteractionRequest): string | null {
  const normalized = prompt.trim();
  const options = interaction.options ?? [];
  if (/^\d+$/.test(normalized)) {
    const index = Number(normalized) - 1;
    return options[index]?.id ?? null;
  }
  return options.find(option => option.id === normalized)?.id ?? null;
}

export class HandleHostLifecycle {
  constructor(
    private readonly currentWork: GetCurrentWork,
    private readonly bindWork: BindWork,
    private readonly checkpoint: LifecycleCheckpoint,
    private readonly context: RouteContext,
    private readonly pendingInteraction: GetPendingInteraction,
    private readonly resolveInteraction: ResolveInteraction,
    private readonly returnToDesign: ReturnToDesign,
    private readonly resolveBlock: ResolveBlock,
  ) {}

  private async summary(cwd: string, targetArtifactId: string): Promise<string> {
    try {
      const manifest = await this.context.execute(cwd, targetArtifactId, { maxItems: 8, maxTotalChars: 12000 });
      const required = manifest.required.map(item => `${item.artifactId}:${item.locator}`).join(", ");
      return `Managed Work ${targetArtifactId}. Required context: ${required || "none"}.`;
    } catch {
      return `Managed Work ${targetArtifactId}.`;
    }
  }

  async execute(signal: HostLifecycleSignal): Promise<HostLifecycleResult> {
    const current = await this.currentWork.execute(signal.cwd, { sessionId: signal.sessionId, host: signal.host });
    if (current.suppressed) return { state: "SILENT" };

    const interaction = await this.pendingInteraction.execute(signal.cwd);
    if (signal.event === "USER_PROMPT" && interaction?.type === "BLOCK") {
      if (requestsReturnToDesign(signal.prompt ?? "")) {
        await this.returnToDesign.execute(signal.cwd, { interactionId: interaction.id, sessionId: signal.sessionId, host: signal.host });
        return { state: "SILENT", blockTransition: { interactionId: interaction.id, action: "returned_to_design" } };
      }
      if (requestsResolveBlock(signal.prompt ?? "")) {
        await this.resolveBlock.execute(signal.cwd, { interactionId: interaction.id, host: signal.host });
        return { state: "SILENT", blockTransition: { interactionId: interaction.id, action: "resolved" } };
      }
    }
    // A BLOCK stops managed implementation work, not the whole Agent session.
    // After ReturnToDesign clears the worktree binding, normal design/research prompts
    // are allowed while the BLOCK remains unresolved. Re-entering implementation is
    // still prevented by BindWork itself.
    if (interaction?.type === "BLOCK" && current.mode === "managed") return { state: "BLOCKED", interaction };

    if (signal.event === "USER_PROMPT" && interaction?.type === "DECISION") {
      if (requestsNativeDecision(signal.prompt ?? "")) return { state: "DECISION_MCP", interaction };
      const selected = parseDecisionReply(signal.prompt ?? "", interaction);
      if (!selected) return { state: "DECISION", interaction };
      await this.resolveInteraction.execute(signal.cwd, { interactionId: interaction.id, selectedOption: selected, host: signal.host, sessionId: signal.sessionId });
      return { state: "SILENT", decisionResolved: { interactionId: interaction.id, optionId: selected } };
    }

    if (signal.event === "SESSION_START") {
      if (current.mode !== "managed" || !current.binding) return { state: "SILENT" };
      return { state: "MANAGED", targetArtifactId: current.binding.targetArtifactId, contextSummary: await this.summary(signal.cwd, current.binding.targetArtifactId) };
    }

    if (signal.event === "USER_PROMPT") {
      const target = parseExplicitWorkIntent(signal.prompt ?? "");
      if (!target) return { state: "SILENT" };
      try {
        const result = await this.bindWork.execute(signal.cwd, { targetArtifactId: target, bindingSource: `${signal.host}:explicit-intent`, sessionId: signal.sessionId, host: signal.host });
        return { state: "MANAGED", targetArtifactId: result.binding.targetArtifactId, contextSummary: await this.summary(signal.cwd, result.binding.targetArtifactId) };
      } catch (error) {
        if (error instanceof ContinuumError && error.code === "CONTINUUM_BLOCKED") {
          const blockedInteraction = error.details?.interaction as InteractionRequest | undefined;
          if (blockedInteraction?.type === "BLOCK") return { state: "BLOCKED", interaction: blockedInteraction };
        }
        if (error instanceof ContinuumError && error.code === "CONTINUUM_DECISION_REQUIRED") {
          const decision = error.details?.interaction as InteractionRequest | undefined;
          if (decision?.type === "DECISION") return { state: "DECISION", interaction: decision };
        }
        throw error;
      }
    }

    if (signal.event === "STABLE_CHECKPOINT" || signal.event === "SESSION_END") {
      try {
        const result = await this.checkpoint.execute(signal.cwd, { source: signal.source, sessionId: signal.sessionId, host: signal.host });
        return { state: "SILENT", checkpoint: result };
      } catch (error) {
        if (error instanceof ContinuumError && error.code === "CONTINUUM_WORK_NOT_FOUND") return { state: "SILENT" };
        throw error;
      }
    }

    return { state: "SILENT" };
  }
}
