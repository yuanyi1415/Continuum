import type { Relation, RelationRouting, RelationType } from "../../domain/relation/relation.js";
import { assertRelationInvariant } from "../../domain/relation/relation.js";
import { attachArtifactRef } from "../../domain/change/change.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { IdGeneratorPort } from "../../ports/id-generator.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";

export interface RegisterRelationInput {
  from: string;
  to: string;
  type: RelationType;
  routing?: RelationRouting;
}

export interface RegisterRelationResult { relation: Relation; created: boolean; }

export class RegisterRelation {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root: string) => ProjectStorePort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  async execute(cwd: string, input: RegisterRelationInput): Promise<RegisterRelationResult> {
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    if (!(await store.nodeExists(input.from))) throw new ContinuumError("CONTINUUM_RELATION_ENDPOINT_NOT_FOUND", `Relation source does not exist: ${input.from}`);
    if (!(await store.nodeExists(input.to))) throw new ContinuumError("CONTINUUM_RELATION_ENDPOINT_NOT_FOUND", `Relation target does not exist: ${input.to}`);

    const routing = input.routing ?? "required";
    const existing = (await store.listRelations()).find(r => r.from === input.from && r.to === input.to && r.type === input.type && r.routing === routing);
    if (existing) return { relation: existing, created: false };

    const relation: Relation = {
      schemaVersion: 1,
      relationId: this.ids.next("rel"),
      from: input.from,
      to: input.to,
      type: input.type,
      routing,
      createdAt: this.clock.nowIso(),
    };
    assertRelationInvariant(relation);
    await store.saveRelation(relation);

    if (relation.type === "belongs_to" && await store.hasChange(relation.to) && await store.hasArtifact(relation.from)) {
      const change = await store.loadChange(relation.to);
      const artifact = await store.loadArtifact(relation.from);
      const updated = attachArtifactRef(change, artifact.artifactId, artifact.type);
      if (updated !== change) await store.saveChange(updated);
    }
    return { relation, created: true };
  }
}
