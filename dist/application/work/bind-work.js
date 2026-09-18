import { assertInteractionInvariant } from "../../domain/interaction/interaction.js";
import { assertWorkBindingInvariant } from "../../domain/work/work-binding.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";
function designBaselines(interaction) {
    const value = interaction.context?.designArtifacts;
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => Boolean(item && typeof item === "object" && typeof item.artifactId === "string"));
}
export class BindWork {
    git;
    storeFactory;
    runtimeFactory;
    authorityFactory;
    clock;
    ids;
    constructor(git, storeFactory, runtimeFactory, authorityFactory, clock, ids) {
        this.git = git;
        this.storeFactory = storeFactory;
        this.runtimeFactory = runtimeFactory;
        this.authorityFactory = authorityFactory;
        this.clock = clock;
        this.ids = ids;
    }
    async designChanges(store, authority, interaction, currentRevision) {
        const changes = [];
        for (const baseline of designBaselines(interaction)) {
            if (!(await store.hasArtifact(baseline.artifactId)))
                continue;
            const artifact = await store.loadArtifact(baseline.artifactId);
            const currentVersion = await authority.getVersionAtRevision(artifact, currentRevision);
            if ((baseline.version ?? undefined) !== (currentVersion ?? undefined)) {
                changes.push({ artifactId: baseline.artifactId, ...(baseline.version ? { fromVersion: baseline.version } : {}), ...(currentVersion ? { toVersion: currentVersion } : {}) });
            }
        }
        return changes;
    }
    async restartDecision(runtime, block, artifact, activeChangeId, currentRevision, changedDesignArtifacts) {
        const existing = (await runtime.listPendingInteractions()).find(item => item.type === "DECISION" &&
            item.context?.kind === "restart-blocked-work" &&
            item.context?.blockInteractionId === block.id &&
            item.context?.targetArtifactId === artifact.artifactId);
        if (existing)
            return existing;
        const request = {
            id: this.ids.next("int"),
            type: "DECISION",
            title: `检测到相关设计已更新`,
            message: `与 ${artifact.artifactId} 相关的 Spec / ADR 已发生变化。是否基于最新设计重新开始实现？`,
            options: [
                { id: "restart-work", label: `重新开始 ${artifact.artifactId}` },
                { id: "keep-designing", label: "继续调整设计" },
            ],
            context: {
                kind: "restart-blocked-work",
                blockInteractionId: block.id,
                targetArtifactId: artifact.artifactId,
                changeId: activeChangeId,
                currentRevision,
                changedDesignArtifacts,
            },
            blocking: true,
            createdAt: this.clock.nowIso(),
        };
        assertInteractionInvariant(request);
        await runtime.savePendingInteraction(request);
        return request;
    }
    async execute(cwd, input) {
        const facts = await this.git.inspect(cwd);
        const store = this.storeFactory(facts.root);
        const runtime = this.runtimeFactory(facts.root);
        const authority = this.authorityFactory(facts.root);
        await store.loadProject();
        await runtime.initialize();
        const artifact = await store.loadArtifact(input.targetArtifactId);
        if (artifact.type !== "ticket") {
            throw new ContinuumError("CONTINUUM_WORK_NOT_FOUND", `Formal Work target must be a ticket ArtifactRef: ${input.targetArtifactId}`, true);
        }
        const relations = await store.listRelationsFor(artifact.artifactId);
        const candidateChangeIds = relations
            .filter(r => r.from === artifact.artifactId && r.type === "belongs_to")
            .map(r => r.to);
        const uniqueChangeIds = [...new Set(candidateChangeIds)];
        const activeChangeIds = [];
        for (const changeId of uniqueChangeIds) {
            if (!(await store.hasChange(changeId)))
                continue;
            const change = await store.loadChange(changeId);
            if (change.status === "active")
                activeChangeIds.push(change.changeId);
        }
        if (activeChangeIds.length === 0) {
            throw new ContinuumError("CONTINUUM_WORK_NOT_FOUND", `Ticket ${artifact.artifactId} is not attached to an active Change.`, true);
        }
        if (activeChangeIds.length > 1) {
            throw new ContinuumError("CONTINUUM_WORK_AMBIGUOUS", `Ticket ${artifact.artifactId} belongs to multiple active Changes.`, true, { changes: activeChangeIds });
        }
        const activeChangeId = activeChangeIds[0];
        const pendingBlocks = (await runtime.listPendingInteractions()).filter(interaction => interaction.type === "BLOCK");
        const blockingInteraction = pendingBlocks.find(interaction => {
            const changeId = interaction.context?.changeId;
            if (typeof changeId === "string" && changeId)
                return changeId === activeChangeId;
            const affectedTickets = interaction.context?.affectedTickets;
            return Array.isArray(affectedTickets) && affectedTickets.includes(artifact.artifactId);
        });
        if (blockingInteraction) {
            const phase = blockingInteraction.context?.blockPhase === "design" ? "design" : "implementation";
            if (phase === "design") {
                const changedDesignArtifacts = await this.designChanges(store, authority, blockingInteraction, facts.currentRevision);
                if (changedDesignArtifacts.length > 0) {
                    const decision = await this.restartDecision(runtime, blockingInteraction, artifact, activeChangeId, facts.currentRevision, changedDesignArtifacts);
                    throw new ContinuumError("CONTINUUM_DECISION_REQUIRED", `Relevant design changed; confirmation is required before restarting ${artifact.artifactId}.`, true, { interaction: decision });
                }
                const userFacing = {
                    ...blockingInteraction,
                    title: `${artifact.artifactId} 还不能继续`,
                    message: `上次发现的设计冲突尚未检测到相关 Spec / ADR 更新。请继续处理设计，完成并提交设计变更后，再次开始 ${artifact.artifactId}。`,
                    context: { ...(blockingInteraction.context ?? {}), userState: "design-unchanged", targetArtifactId: artifact.artifactId },
                };
                throw new ContinuumError("CONTINUUM_BLOCKED", `Design conflict remains unresolved for ${artifact.artifactId}.`, true, { interaction: userFacing });
            }
            throw new ContinuumError("CONTINUUM_BLOCKED", `Cannot bind ${artifact.artifactId}; a design conflict is still active for Change ${activeChangeId}.`, true, { interaction: blockingInteraction });
        }
        const existing = await runtime.getWorktreeBinding(facts.worktreeIdentity);
        if (existing) {
            if (existing.targetArtifactId !== artifact.artifactId) {
                throw new ContinuumError("CONTINUUM_WORK_CONFLICT", `Worktree is already bound to ${existing.targetArtifactId}; refusing to replace its Work Baseline implicitly.`, true, { existing });
            }
            let sessionBound = false;
            if (input.sessionId && input.host) {
                const suppressed = await runtime.isSessionSuppressed(input.sessionId, input.host);
                if (!suppressed) {
                    await runtime.bindSession({ sessionId: input.sessionId, host: input.host, worktreeId: facts.worktreeIdentity, boundAt: this.clock.nowIso() });
                    sessionBound = true;
                }
            }
            return { binding: existing, created: false, sessionBound };
        }
        const binding = {
            workId: this.ids.next("work"),
            worktreeId: facts.worktreeIdentity,
            targetArtifactId: artifact.artifactId,
            changeId: activeChangeId,
            workStartRevision: facts.currentRevision,
            boundAt: this.clock.nowIso(),
            bindingSource: input.bindingSource?.trim() || "explicit-cli",
        };
        assertWorkBindingInvariant(binding);
        const stored = await runtime.bindWork(binding);
        if (stored.targetArtifactId !== binding.targetArtifactId) {
            throw new ContinuumError("CONTINUUM_WORK_CONFLICT", `Another Work was bound to this worktree concurrently: ${stored.targetArtifactId}`, true, { existing: stored });
        }
        let sessionBound = false;
        if (input.sessionId && input.host) {
            const suppressed = await runtime.isSessionSuppressed(input.sessionId, input.host);
            if (!suppressed) {
                await runtime.bindSession({ sessionId: input.sessionId, host: input.host, worktreeId: facts.worktreeIdentity, boundAt: this.clock.nowIso() });
                sessionBound = true;
            }
        }
        return { binding: stored, created: true, sessionBound };
    }
}
//# sourceMappingURL=bind-work.js.map