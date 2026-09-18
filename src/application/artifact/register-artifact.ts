import type { ArtifactRef, ArtifactType } from "../../domain/artifact/artifact-ref.js";
import { assertArtifactRefInvariant } from "../../domain/artifact/artifact-ref.js";
import type { ArtifactAuthorityPort } from "../../ports/artifact-authority.js";
import type { GitPort } from "../../ports/git.js";
import type { IdGeneratorPort } from "../../ports/id-generator.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";

export interface RegisterArtifactInput {
  artifactId?: string;
  type: ArtifactType;
  authority: string;
  locator: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface RegisterArtifactResult { artifact: ArtifactRef; created: boolean; }

export class RegisterArtifact {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root: string) => ProjectStorePort,
    private readonly authorityFactory: (root: string) => ArtifactAuthorityPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  async execute(cwd: string, input: RegisterArtifactInput): Promise<RegisterArtifactResult> {
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    const artifactId = input.artifactId?.trim() || this.ids.next("art");
    const candidate: ArtifactRef = {
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
      if (!sameIdentity) throw new ContinuumError("CONTINUUM_ARTIFACT_CONFLICT", `Artifact ${artifactId} already exists with a different identity.`);
      return { artifact: existing, created: false };
    }

    const authority = this.authorityFactory(facts.root);
    const resolved = await authority.resolve(candidate);
    if (!resolved.exists) throw new ContinuumError("CONTINUUM_ARTIFACT_NOT_FOUND", `Artifact source does not exist: ${candidate.locator}`, true);
    const artifact: ArtifactRef = { ...candidate, ...(resolved.version ? { version: resolved.version } : {}) };
    await store.saveArtifact(artifact);
    return { artifact, created: true };
  }
}
