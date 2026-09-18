import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
export interface ProjectStatus {
    project: {
        projectId: string;
        name: string;
        repositoryIdentity: string;
    };
    current: {
        snapshotId: string;
        revision: string;
        stage?: string;
        activeChanges: string[];
        blockers: string[];
    };
    changes: {
        active: Array<{
            changeId: string;
            title: string;
            specRefs: string[];
            ticketRefs: string[];
        }>;
    };
    runtime: {
        available: boolean;
        schemaVersion?: number;
        driver?: string;
        error?: string;
    };
    work: {
        mode: "aware" | "managed";
        binding: null | {
            workId: string;
            targetArtifactId: string;
            changeId?: string;
            workStartRevision: string;
            worktreeId: string;
        };
    };
    git: {
        root: string;
        head: string;
        baselineMatchesHead: boolean;
    };
}
export declare class GetStatus {
    private readonly git;
    private readonly storeFactory;
    private readonly runtimeFactory;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, runtimeFactory: (root: string) => RuntimeStorePort);
    execute(cwd: string): Promise<ProjectStatus>;
}
