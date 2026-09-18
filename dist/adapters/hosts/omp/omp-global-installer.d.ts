export interface OmpGlobalInstallResult {
    scope: "user";
    agentDir: string;
    extensionPath: string;
    extensionInstalled: boolean;
    warnings: string[];
}
export declare class OmpGlobalInstaller {
    private readonly home;
    private readonly env;
    constructor(home?: () => string, env?: NodeJS.ProcessEnv);
    agentDir(): string;
    install(extensionAssetPath: string): Promise<OmpGlobalInstallResult>;
}
