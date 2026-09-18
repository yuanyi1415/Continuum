export type KnowledgeImpact = "N0" | "N1" | "N2" | "N3" | "N4";
export type ReconcileActionClass = "AUTO" | "PROPOSE" | "STOP";
export type EvidenceStatus = "PASS" | "FAIL" | "UNKNOWN";
export interface EvidenceFact {
    status: EvidenceStatus;
    source: string;
    details?: Record<string, unknown>;
}
export interface WorkReconcileEvidence {
    tests: EvidenceFact;
    review: EvidenceFact;
    completion: EvidenceFact;
}
export interface WorkReconcileCandidate {
    workId: string;
    baseRevision: string;
    currentRevision: string;
    changedFiles: string[];
    evidence: WorkReconcileEvidence;
    knowledgeImpact: KnowledgeImpact;
    actions: ReconcileActionClass[];
    updatedAt: string;
}
export declare function actionsForImpact(impact: KnowledgeImpact): ReconcileActionClass[];
export declare function isContinuumInternalPath(path: string): boolean;
export declare function classifyKnowledgeImpact(changedFiles: string[]): KnowledgeImpact;
