export type MaintenanceLevel = "PASS" | "WARN" | "FAIL";
export interface DurableSchemaFileStatus {
    path: string;
    kind: string;
    schemaVersion?: number;
    level: MaintenanceLevel;
    message: string;
}
export interface DurableInspection {
    currentVersion: number;
    files: DurableSchemaFileStatus[];
    hasOlderSchema: boolean;
    hasTooNewSchema: boolean;
    hasInvalidSchema: boolean;
}
export interface DurableMigrationResult {
    fromVersions: number[];
    toVersion: number;
    migratedFiles: string[];
    backupDirectory?: string;
}
export interface DurableMaintenancePort {
    inspect(): Promise<DurableInspection>;
    migrate(): Promise<DurableMigrationResult>;
}
export interface RuntimeMigrationResult {
    fromVersion: number;
    toVersion: number;
    applied: number[];
}
export interface RuntimeRecoveryResult {
    action: "none" | "created" | "migrated" | "quarantined-rebuilt";
    schemaVersion: number;
    quarantinedPaths: string[];
    migration?: RuntimeMigrationResult;
}
export interface HostDiagnostic {
    host: "codex" | "omp";
    level: MaintenanceLevel;
    installed: boolean;
    adapterPresent: boolean;
    adapterCurrent?: boolean;
    message: string;
    details?: Record<string, unknown>;
}
export interface HostDiagnosticsPort {
    inspect(): Promise<HostDiagnostic[]>;
}
