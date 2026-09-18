import { assertArtifactRefInvariant } from "../../domain/artifact/artifact-ref.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";
export class RegisterArtifact {
    git;
    storeFactory;
    authorityFactory;
    ids;
    constructor(git, storeFactory, authorityFactory, ids) {
        this.git = git;
        this.storeFactory = storeFactory;
        this.authorityFactory = authorityFactory;
        this.ids = ids;
    }
    async execute(cwd, input) {
        const facts = await this.git.inspect(cwd);
        const store = this.storeFactory(facts.root);
        const artifactId = input.artifactId?.trim() || this.ids.next("art");
        const candidate = {
            schemaVersion: 1,
            artifactId,
            type: input.type,
            authority: input.authority.trim(),
            locator: input.locator.trim(),
            ...(input.title?.trim() ? { title: input.title.trim() } : {}),
            ...(input.metadata ? { metadata: input.metadata } : {}),
        };
        assertArtifactRefInvariant(candidate);
        if (await store.hasArtifact(artifactId)) {
            const existing = await store.loadArtifact(artifactId);
            const sameIdentity = existing.type === candidate.type && existing.authority === candidate.authority && existing.locator === candidate.locator;
            if (!sameIdentity)
                throw new ContinuumError("CONTINUUM_ARTIFACT_CONFLICT", `Artifact ${artifactId} already exists with a different identity.`);
            return { artifact: existing, created: false };
        }
        const authority = this.authorityFactory(facts.root);
        const resolved = await authority.resolve(candidate);
        if (!resolved.exists)
            throw new ContinuumError("CONTINUUM_ARTIFACT_NOT_FOUND", `Artifact source does not exist: ${candidate.locator}`, true);
        const artifact = { ...candidate, ...(resolved.version ? { version: resolved.version } : {}) };
        await store.saveArtifact(artifact);
        return { artifact, created: true };
    }
}
//# sourceMappingURL=register-artifact.js.map