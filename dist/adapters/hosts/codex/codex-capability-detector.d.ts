export interface CodexCapabilities {
    installed: boolean;
    version?: string;
    lifecycleHooks: boolean;
    structuredDecision: boolean;
    blockingUi: boolean;
    ambientStatus: false;
    headless: boolean;
    diagnostics: string[];
}
export type CommandRunner = (command: string, args: string[]) => Promise<{
    stdout: string;
    stderr: string;
}>;
export declare class CodexCapabilityDetector {
    private readonly run;
    constructor(run?: CommandRunner);
    detect(): Promise<CodexCapabilities>;
}
