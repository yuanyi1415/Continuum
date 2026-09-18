export class ListChanges {
    git;
    storeFactory;
    constructor(git, storeFactory) {
        this.git = git;
        this.storeFactory = storeFactory;
    }
    async execute(cwd, status) {
        const facts = await this.git.inspect(cwd);
        const store = this.storeFactory(facts.root);
        const changes = await store.listChanges();
        return status ? changes.filter(change => change.status === status) : changes;
    }
}
//# sourceMappingURL=list-changes.js.map