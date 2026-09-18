import type { RepositoryFilesPort } from "../../ports/repository-files.js";
export declare class RepositoryFilesAdapter implements RepositoryFilesPort {
    ensureContinuumLocalIgnored(root: string): Promise<void>;
}
