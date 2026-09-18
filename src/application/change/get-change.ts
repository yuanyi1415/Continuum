import type { Change } from "../../domain/change/change.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";

export class GetChange {
  constructor(private readonly git: GitPort, private readonly storeFactory: (root: string) => ProjectStorePort) {}
  async execute(cwd: string, changeId: string): Promise<Change> {
    const facts = await this.git.inspect(cwd);
    return this.storeFactory(facts.root).loadChange(changeId);
  }
}
