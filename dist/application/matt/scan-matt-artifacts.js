import { ContinuumError } from "../../shared/errors/continuum-error.js";
export class ScanMattArtifacts {
    git;
    storeFactory;
    observerFactory;
    registerArtifact;
    registerRelation;
    constructor(git, storeFactory, observerFactory, registerArtifact, registerRelation) {
        this.git = git;
        this.storeFactory = storeFactory;
        this.observerFactory = observerFactory;
        this.registerArtifact = registerArtifact;
        this.registerRelation = registerRelation;
    }
    async execute(cwd, changeId) {
        const facts = await this.git.inspect(cwd);
        const store = this.storeFactory(facts.root);
        if (changeId && !(await store.hasChange(changeId))) {
            throw new ContinuumError("CONTINUUM_CHANGE_NOT_FOUND", `Change not found: ${changeId}`, true);
        }
        const discovered = await this.observerFactory(facts.root).observe();
        const registered = [], existing = [], linkedToChange = [];
        for (const item of discovered) {
            const result = await this.registerArtifact.execute(facts.root, {
                artifactId: item.artifactId,
                type: item.type,
                authority: "git-file",
                locator: item.locator,
                title: item.title,
                metadata: { observed_by: "matt-local-observer" },
            });
            (result.created ? registered : existing).push(item.artifactId);
            if (changeId && (item.type === "spec" || item.type === "ticket")) {
                const rel = await this.registerRelation.execute(facts.root, { from: item.artifactId, to: changeId, type: "belongs_to", routing: "required" });
                if (rel.created)
                    linkedToChange.push(item.artifactId);
            }
        }
        return { discovered, registered, existing, linkedToChange };
    }
}
//# sourceMappingURL=scan-matt-artifacts.js.map