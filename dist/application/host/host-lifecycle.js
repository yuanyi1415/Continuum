import { ContinuumError } from "../../shared/errors/continuum-error.js";
export function parseExplicitWorkIntent(prompt) {
    // Host adapters may receive transformed user-work text with a lightweight
    // wrapper/prefix. Only accept an explicit implement directive at a line
    // boundary; do not broaden this to natural-language mentions such as
    // "please implement P03".
    const match = prompt.match(/(?:^|\r?\n)[ \t]*\/?implement\s+([A-Za-z0-9][A-Za-z0-9._:-]{0,127})(?=$|[\s,;!?，；！？])/im);
    return match?.[1] ?? null;
}
function requestsNativeDecision(prompt) {
    return /^\/?continuum(?:\s+|-)decision$/i.test(prompt.trim());
}
function requestsReturnToDesign(prompt) {
    return /^\/?continuum(?:\s+|-)return(?:\s+|-)to(?:\s+|-)design$/i.test(prompt.trim());
}
function requestsResolveBlock(prompt) {
    return /^\/?continuum(?:\s+|-)resolve(?:\s+|-)block$/i.test(prompt.trim());
}
function parseDecisionReply(prompt, interaction) {
    const normalized = prompt.trim();
    const options = interaction.options ?? [];
    if (/^\d+$/.test(normalized)) {
        const index = Number(normalized) - 1;
        return options[index]?.id ?? null;
    }
    return options.find(option => option.id === normalized)?.id ?? null;
}
export class HandleHostLifecycle {
    currentWork;
    bindWork;
    checkpoint;
    context;
    pendingInteraction;
    resolveInteraction;
    returnToDesign;
    resolveBlock;
    constructor(currentWork, bindWork, checkpoint, context, pendingInteraction, resolveInteraction, returnToDesign, resolveBlock) {
        this.currentWork = currentWork;
        this.bindWork = bindWork;
        this.checkpoint = checkpoint;
        this.context = context;
        this.pendingInteraction = pendingInteraction;
        this.resolveInteraction = resolveInteraction;
        this.returnToDesign = returnToDesign;
        this.resolveBlock = resolveBlock;
    }
    async summary(cwd, targetArtifactId) {
        try {
            const manifest = await this.context.execute(cwd, targetArtifactId, { maxItems: 8, maxTotalChars: 12000 });
            const required = manifest.required.map(item => `${item.artifactId}:${item.locator}`).join(", ");
            return `Managed Work ${targetArtifactId}. Required context: ${required || "none"}.`;
        }
        catch {
            return `Managed Work ${targetArtifactId}.`;
        }
    }
    async execute(signal) {
        const current = await this.currentWork.execute(signal.cwd, { sessionId: signal.sessionId, host: signal.host });
        if (current.suppressed)
            return { state: "SILENT" };
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
        if (interaction?.type === "BLOCK" && current.mode === "managed")
            return { state: "BLOCKED", interaction };
        if (signal.event === "USER_PROMPT" && interaction?.type === "DECISION") {
            if (requestsNativeDecision(signal.prompt ?? ""))
                return { state: "DECISION_MCP", interaction };
            const selected = parseDecisionReply(signal.prompt ?? "", interaction);
            if (!selected)
                return { state: "DECISION", interaction };
            await this.resolveInteraction.execute(signal.cwd, { interactionId: interaction.id, selectedOption: selected, host: signal.host, sessionId: signal.sessionId });
            return { state: "SILENT", decisionResolved: { interactionId: interaction.id, optionId: selected } };
        }
        if (signal.event === "SESSION_START") {
            if (current.mode !== "managed" || !current.binding)
                return { state: "SILENT" };
            return { state: "MANAGED", targetArtifactId: current.binding.targetArtifactId, contextSummary: await this.summary(signal.cwd, current.binding.targetArtifactId) };
        }
        if (signal.event === "USER_PROMPT") {
            const target = parseExplicitWorkIntent(signal.prompt ?? "");
            if (!target)
                return { state: "SILENT" };
            try {
                const result = await this.bindWork.execute(signal.cwd, { targetArtifactId: target, bindingSource: `${signal.host}:explicit-intent`, sessionId: signal.sessionId, host: signal.host });
                return { state: "MANAGED", targetArtifactId: result.binding.targetArtifactId, contextSummary: await this.summary(signal.cwd, result.binding.targetArtifactId) };
            }
            catch (error) {
                if (error instanceof ContinuumError && error.code === "CONTINUUM_BLOCKED") {
                    const blockedInteraction = error.details?.interaction;
                    if (blockedInteraction?.type === "BLOCK")
                        return { state: "BLOCKED", interaction: blockedInteraction };
                }
                if (error instanceof ContinuumError && error.code === "CONTINUUM_DECISION_REQUIRED") {
                    const decision = error.details?.interaction;
                    if (decision?.type === "DECISION")
                        return { state: "DECISION", interaction: decision };
                }
                throw error;
            }
        }
        if (signal.event === "STABLE_CHECKPOINT" || signal.event === "SESSION_END") {
            try {
                const result = await this.checkpoint.execute(signal.cwd, { source: signal.source, sessionId: signal.sessionId, host: signal.host });
                return { state: "SILENT", checkpoint: result };
            }
            catch (error) {
                if (error instanceof ContinuumError && error.code === "CONTINUUM_WORK_NOT_FOUND")
                    return { state: "SILENT" };
                throw error;
            }
        }
        return { state: "SILENT" };
    }
}
//# sourceMappingURL=host-lifecycle.js.map