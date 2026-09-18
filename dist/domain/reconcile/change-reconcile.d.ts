import type { WorkReconcileCandidate, KnowledgeImpact } from "./work-reconcile.js";
export type ChangeReconcileResultStatus = "pass" | "blocked";
export interface ResolvedWorkSummary {
    ticketId: string;
    workId: string;
    baseRevision: string;
    currentRevision: string;
    knowledgeImpact: KnowledgeImpact;
    changedFiles: string[];
    evidence: WorkReconcileCandidate["evidence"];
}
export interface ChangeReconcile {
    schemaVersion: 1;
    reconcileId: string;
    projectId: string;
    changeId: string;
    inputSnapshotId: string;
    implementationRevision: string;
    createdAt: string;
    implementationSummary: string;
    resolvedWork: ResolvedWorkSummary[];
    unresolvedWork: Array<{
        ticketId: string;
        reason: string;
    }>;
    knowledgeChanges: Array<{
        ticketId: string;
        impact: KnowledgeImpact;
        note: string;
    }>;
    architectureDecisions: Array<{
        ticketId: string;
        note: string;
    }>;
    discoveredWork: string[];
    result: ChangeReconcileResultStatus;
    blockReasons: string[];
}
export declare function assertChangeReconcileInvariant(value: ChangeReconcile): void;
