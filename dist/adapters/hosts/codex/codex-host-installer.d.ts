export interface CodexInstallResult {
    hooksPath: string;
    configPath: string;
    instructionsPath: string;
    hookInstalled: boolean;
    hooksEnabled: boolean;
    mcp: "installed" | "existing" | "skipped" | "unavailable";
    warnings: string[];
}
export declare class CodexHostInstaller {
    install(repositoryRoot: string, cliEntryPath: string, mcpServerPath: string, registerMcp?: boolean): Promise<CodexInstallResult>;
}
