import { assertRelationInvariant } from "../../domain/relation/relation.js";
import { attachArtifactRef } from "../../domain/change/change.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";
export class RegisterRelation {
    git;
    storeFactory;
    clock;
    ids;
    constructor(git, storeFactory, clock, ids) {
        this.git = git;
        this.storeFactory = storeFactory;
        this.clock = clock;
        this.ids = ids;
    }
    async execute(cwd, input) {
        const facts = await this.git.inspect(cwd);
        const store = this.storeFactory(facts.root);
        if (!(await store.nodeExists(input.from)))
            throw new ContinuumError("CONTINUUM_RELATION_ENDPOINT_NOT_FOUND", `Relation source does not exist: ${input.from}`);
        if (!(await store.nodeExists(input.to)))
            throw new ContinuumError("CONTINUUM_RELATION_ENDPOINT_NOT_FOUND", `Relation target does not exist: ${input.to}`);
        const routing = input.routing ?? "required";
        const existing = (await store.listRelations()).find(r => r.from === input.from && r.to === input.to && r.type === input.type && r.routing === routing);
        if (existing)
            return { relation: existing, created: false };
        const relation = {
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
            if (updated !== change)
                await store.saveChange(updated);
        }
        return { relation, created: true };
    }
}
//# sourceMappingURL=register-relation.js.map