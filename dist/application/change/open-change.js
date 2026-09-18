import { assertChangeInvariant } from "../../domain/change/change.js";
export class OpenChange {
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
    async execute(cwd, title, intent) {
        const normalizedTitle = title.trim();
        if (!normalizedTitle)
            throw new Error("change title cannot be empty");
        const facts = await this.git.inspect(cwd);
        const store = this.storeFactory(facts.root);
        await store.loadProject();
        const change = {
            schemaVersion: 1,
            changeId: this.ids.next("chg"),
            title: normalizedTitle,
            ...(intent?.trim() ? { intent: intent.trim() } : {}),
            status: "active",
            createdAt: this.clock.nowIso(),
            specRefs: [],
            ticketRefs: [],
        };
        assertChangeInvariant(change);
        await store.saveChange(change);
        return change;
    }
}
//# sourceMappingURL=open-change.js.map