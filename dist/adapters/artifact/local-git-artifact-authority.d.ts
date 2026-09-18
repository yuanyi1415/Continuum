import type { ArtifactRef } from "../../domain/artifact/artifact-ref.js";
import type { ArtifactAuthorityPort, ResolvedArtifact } from "../../ports/artifact-authority.js";
export declare class LocalGitArtifactAuthority implements ArtifactAuthorityPort {
    private readonly repositoryRoot;
    constructor(repositoryRoot: string);
    private assertAuthority;
    exists(ref: ArtifactRef): Promise<boolean>;
    getVersion(ref: ArtifactRef): Promise<string | undefined>;
    getVersionAtRevision(ref: ArtifactRef, revision: string): Promise<string | undefined>;
    resolve(ref: ArtifactRef): Promise<ResolvedArtifact>;
}
