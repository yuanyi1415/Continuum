import type { ArtifactAuthorityPort } from "../../ports/artifact-authority.js";
import type { GitPort } from "../../ports/git.js";
import type { DurableMaintenancePort, HostDiagnosticsPort } from "../../ports/maintenance.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
import type { ReconcileWork } from "../reconcile/reconcile-work.js";
export type CheckLevel = "PASS" | "WARN" | "FAIL";
export interface DoctorCheck {
    name: string;
    level: CheckLevel;
    message: string;
    code?: string;
    recoverable?: boolean;
    repaired?: boolean;
    details?: Record<string, unknown>;
}
export interface DoctorResult {
    ok: boolean;
    recovered: boolean;
    checks: DoctorCheck[];
}
export interface DoctorOptions {
    recover?: boolean;
}
export declare class Doctor {
    private readonly git;
    private readonly storeFactory;
    private readonly runtimeFactory;
    private readonly durableFactory;
    private readonly authorityFactory;
    private readonly hostFactory;
    private readonly reconcileWork;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, runtimeFactory: (root: string) => RuntimeStorePort, durableFactory: (root: string) => DurableMaintenancePort, authorityFactory: (root: string) => ArtifactAuthorityPort, hostFactory: (root: string) => HostDiagnosticsPort, reconcileWork: ReconcileWork);
    execute(cwd: string, options?: DoctorOptions): Promise<DoctorResult>;
}
