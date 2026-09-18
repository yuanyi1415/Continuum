import type { ArtifactRef, ArtifactType } from "../../domain/artifact/artifact-ref.js";
import type { ArtifactAuthorityPort } from "../../ports/artifact-authority.js";
import type { GitPort } from "../../ports/git.js";
import type { IdGeneratorPort } from "../../ports/id-generator.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
export interface RegisterArtifactInput {
    artifactId?: string;
    type: ArtifactType;
    authority: string;
    locator: string;
    title?: string;
    metadata?: Record<string, unknown>;
}
export interface RegisterArtifactResult {
    artifact: ArtifactRef;
    created: boolean;
}
export declare class RegisterArtifact {
    private readonly git;
    private readonly storeFactory;
    private readonly authorityFactory;
    private readonly ids;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, authorityFactory: (root: string) => ArtifactAuthorityPort, ids: IdGeneratorPort);
    execute(cwd: string, input: RegisterArtifactInput): Promise<RegisterArtifactResult>;
}
