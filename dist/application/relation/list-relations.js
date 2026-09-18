export class ListRelations {
    git;
    storeFactory;
    constructor(git, storeFactory) {
        this.git = git;
        this.storeFactory = storeFactory;
    }
    async execute(cwd, nodeId) {
        const facts = await this.git.inspect(cwd);
        const store = this.storeFactory(facts.root);
        return nodeId ? store.listRelationsFor(nodeId) : store.listRelations();
    }
}
//# sourceMappingURL=list-relations.js.map