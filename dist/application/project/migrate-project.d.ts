import type { GitPort } from "../../ports/git.js";
import type { DurableMaintenancePort, DurableMigrationResult, RuntimeMigrationResult } from "../../ports/maintenance.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
export interface MigrateProjectResult {
    durable: DurableMigrationResult;
    runtime: RuntimeMigrationResult;
}
export declare class MigrateProject {
    private readonly git;
    private readonly durableFactory;
    private readonly runtimeFactory;
    constructor(git: GitPort, durableFactory: (root: string) => DurableMaintenancePort, runtimeFactory: (root: string) => RuntimeStorePort);
    execute(cwd: string): Promise<MigrateProjectResult>;
}
