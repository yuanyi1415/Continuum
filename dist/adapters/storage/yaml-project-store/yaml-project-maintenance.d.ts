import type { DurableInspection, DurableMaintenancePort, DurableMigrationResult } from "../../../ports/maintenance.js";
export declare const DURABLE_SCHEMA_VERSION = 1;
export declare class YamlProjectMaintenance implements DurableMaintenancePort {
    private readonly repositoryRoot;
    private readonly nowIso;
    private readonly durableRoot;
    private readonly localRoot;
    private readonly codec;
    private readonly validator;
    constructor(repositoryRoot: string, nowIso: () => string);
    inspect(): Promise<DurableInspection>;
    migrate(): Promise<DurableMigrationResult>;
}
