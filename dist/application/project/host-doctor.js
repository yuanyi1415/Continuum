export class HostDoctor {
    git;
    factory;
    constructor(git, factory) {
        this.git = git;
        this.factory = factory;
    }
    async execute(cwd) {
        const facts = await this.git.inspect(cwd);
        return this.factory(facts.root).inspect();
    }
}
//# sourceMappingURL=host-doctor.js.map