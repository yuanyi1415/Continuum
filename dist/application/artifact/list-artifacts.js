export class ListArtifacts {
    git;
    storeFactory;
    constructor(git, storeFactory) {
        this.git = git;
        this.storeFactory = storeFactory;
    }
    async execute(cwd) {
        const facts = await this.git.inspect(cwd);
        return this.storeFactory(facts.root).listArtifacts();
    }
}
//# sourceMappingURL=list-artifacts.js.map