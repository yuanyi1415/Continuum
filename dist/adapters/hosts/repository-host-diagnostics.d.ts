import type { HostDiagnostic, HostDiagnosticsPort } from "../../ports/maintenance.js";
export declare class RepositoryHostDiagnostics implements HostDiagnosticsPort {
    private readonly repositoryRoot;
    private readonly ompAssetPath;
    private readonly detectCodex;
    private readonly detectOmp;
    constructor(repositoryRoot: string, ompAssetPath: string, detectCodex?: () => Promise<import("./codex/codex-capability-detector.js").CodexCapabilities>, detectOmp?: () => Promise<import("./omp/omp-capability-detector.js").OmpCapabilities>);
    inspect(): Promise<HostDiagnostic[]>;
}
