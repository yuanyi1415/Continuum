export declare class GitHookInstaller {
    install(hooksDirectory: string, command?: string): Promise<{
        path: string;
        updated: boolean;
    }>;
}
