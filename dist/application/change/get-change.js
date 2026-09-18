export class GetChange {
    git;
    storeFactory;
    constructor(git, storeFactory) {
        this.git = git;
        this.storeFactory = storeFactory;
    }
    async execute(cwd, changeId) {
        const facts = await this.git.inspect(cwd);
        return this.storeFactory(facts.root).loadChange(changeId);
    }
}
//# sourceMappingURL=get-change.js.map