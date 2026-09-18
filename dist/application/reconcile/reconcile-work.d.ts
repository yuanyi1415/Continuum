import { type WorkReconcileCandidate } from "../../domain/reconcile/work-reconcile.js";
import type { ClockPort } from "../../ports/clock.js";
import type { EvidencePort } from "../../ports/evidence.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
export type WorkReconcileStatus = "NOOP" | "UPDATED" | "DEDUPED";
export interface ReconcileWorkResult {
    status: WorkReconcileStatus;
    candidate: WorkReconcileCandidate | null;
    idempotencyKey?: string;
}
export declare class ReconcileWork {
    private readonly git;
    private readonly storeFactory;
    private readonly runtimeFactory;
    private readonly evidence;
    private readonly clock;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, runtimeFactory: (root: string) => RuntimeStorePort, evidence: EvidencePort, clock: ClockPort);
    execute(cwd: string): Promise<ReconcileWorkResult>;
}
