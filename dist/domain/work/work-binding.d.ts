export interface WorkBinding {
    workId: string;
    worktreeId: string;
    targetArtifactId: string;
    changeId?: string;
    workStartRevision: string;
    boundAt: string;
    bindingSource: string;
}
export interface SessionBinding {
    sessionId: string;
    host: string;
    worktreeId: string;
    boundAt: string;
}
export interface SessionSuppression {
    sessionId: string;
    host: string;
    suppressedAt: string;
    reason?: string;
}
export declare function assertWorkBindingInvariant(binding: WorkBinding): void;
