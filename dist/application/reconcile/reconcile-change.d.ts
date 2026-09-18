import type { Change } from "../../domain/change/change.js";
import type { ChangeReconcile } from "../../domain/reconcile/change-reconcile.js";
import type { Snapshot } from "../../domain/snapshot/snapshot.js";
import type { ArtifactAuthorityPort } from "../../ports/artifact-authority.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
export interface ReconcileChangeResult {
    status: "CLOSED" | "RECOVERED";
    reconcile: ChangeReconcile;
    snapshot: Snapshot;
    change: Change;
}
export declare class ReconcileChange {
    private readonly git;
    private readonly storeFactory;
    private readonly runtimeFactory;
    private readonly authorityFactory;
    private readonly clock;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, runtimeFactory: (root: string) => RuntimeStorePort, authorityFactory: (root: string) => ArtifactAuthorityPort, clock: ClockPort);
    private runtimeFacts;
    private cleanupRuntime;
    private validateSpecs;
    private designArtifactVersions;
    private interaction;
    execute(cwd: string, changeId: string): Promise<ReconcileChangeResult>;
}
