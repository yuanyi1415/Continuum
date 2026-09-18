import type { HostDiagnostic, HostDiagnosticsPort } from "../../ports/maintenance.js";
export declare class UserHostDiagnostics implements HostDiagnosticsPort {
    private readonly ompAssetPath;
    private readonly repositoryRoot?;
    private readonly detectCodex;
    private readonly detectOmp;
    private readonly home;
    private readonly env;
    constructor(ompAssetPath: string, repositoryRoot?: string | undefined, detectCodex?: () => Promise<import("./codex/codex-capability-detector.js").CodexCapabilities>, detectOmp?: () => Promise<import("./omp/omp-capability-detector.js").OmpCapabilities>, home?: () => string, env?: NodeJS.ProcessEnv);
    private codexHome;
    private ompAgentDir;
    inspect(): Promise<HostDiagnostic[]>;
}
