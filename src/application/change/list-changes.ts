import type { Change, ChangeStatus } from "../../domain/change/change.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";

export class ListChanges {
  constructor(private readonly git: GitPort, private readonly storeFactory: (root: string) => ProjectStorePort) {}
  async execute(cwd: string, status?: ChangeStatus): Promise<Change[]> {
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    const changes = await store.listChanges();
    return status ? changes.filter(change => change.status === status) : changes;
  }
}
