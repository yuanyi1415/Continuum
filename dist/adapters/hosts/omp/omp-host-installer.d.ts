export interface OmpInstallResult {
    extensionPath: string;
    instructionsPath: string;
    extensionInstalled: boolean;
    instructionsUpdated: boolean;
    warnings: string[];
}
export declare class OmpHostInstaller {
    install(repositoryRoot: string, extensionAssetPath: string): Promise<OmpInstallResult>;
}
