export interface CodexGlobalInstallResult {
    scope: "user";
    codexHome: string;
    hooksPath: string;
    configPath: string;
    hookInstalled: boolean;
    hooksEnabled: boolean;
    mcp: "installed" | "existing" | "skipped" | "unavailable";
    warnings: string[];
}
export type CodexGlobalCommandRunner = (command: string, args: string[]) => Promise<{
    stdout: string;
    stderr: string;
}>;
export declare class CodexGlobalInstaller {
    private readonly run;
    private readonly home;
    private readonly env;
    constructor(run?: CodexGlobalCommandRunner, home?: () => string, env?: NodeJS.ProcessEnv);
    codexHome(): string;
    install(cliEntryPath: string, mcpServerPath: string, registerMcp?: boolean): Promise<CodexGlobalInstallResult>;
}
