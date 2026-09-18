import type { ContextManifest } from "../../domain/context/context-manifest.js";
import type { ArtifactAuthorityPort } from "../../ports/artifact-authority.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
interface RouteOptions {
    maxHops?: number;
    maxItems?: number;
    maxTotalChars?: number;
}
export declare class RouteContext {
    private readonly git;
    private readonly storeFactory;
    private readonly authorityFactory;
    private readonly clock;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, authorityFactory: (root: string) => ArtifactAuthorityPort, clock: ClockPort);
    execute(cwd: string, workId: string, options?: RouteOptions): Promise<ContextManifest>;
}
export {};
