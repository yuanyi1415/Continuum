export interface OmpCapabilities {
    installed: boolean;
    version?: string;
    lifecycleHooks: boolean;
    projectExtensions: boolean;
    ambientWidget: boolean;
    structuredDecision: boolean;
    blockingUi: boolean;
    headless: boolean;
    diagnostics: string[];
}
export type OmpCommandRunner = (command: string, args: string[]) => Promise<{
    stdout: string;
    stderr: string;
}>;
export declare class OmpCapabilityDetector {
    private readonly run;
    constructor(run?: OmpCommandRunner);
    detect(): Promise<OmpCapabilities>;
}
