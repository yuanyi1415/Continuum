import type { GitPort, GitRepositoryFacts } from "../../ports/git.js";
export declare class ShellGitPort implements GitPort {
    inspect(cwd: string): Promise<GitRepositoryFacts>;
    getChangedFiles(cwd: string, fromRevision: string, toRevision: string): Promise<string[]>;
    getDiff(cwd: string, fromRevision: string, toRevision: string): Promise<string>;
    getHooksDirectory(cwd: string): Promise<string>;
    listWorktreeRoots(cwd: string): Promise<string[]>;
    isAncestor(cwd: string, ancestorRevision: string, descendantRevision: string): Promise<boolean>;
}
