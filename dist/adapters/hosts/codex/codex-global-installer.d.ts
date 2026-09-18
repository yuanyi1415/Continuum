export interface CodexGlobalInstallResult {
    scope: "user";
    codexHome: string;
    hooksPath: string;
    configPath: string;
    hookInstalled: boolean;
    hooksEnabled: boolean;
    mcp: "installed" | "existing";
    warnings: string[];
}
export declare class CodexGlobalInstaller {
    private readonly home;
    private readonly env;
    constructor(home?: () => string, env?: NodeJS.ProcessEnv);
    codexHome(): string;
    install(cliEntryPath: string, mcpServerPath: string, registerMcp?: boolean): Promise<CodexGlobalInstallResult>;
}
