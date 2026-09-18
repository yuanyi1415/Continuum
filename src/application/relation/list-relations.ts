import type { Relation } from "../../domain/relation/relation.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";

export class ListRelations {
  constructor(private readonly git: GitPort, private readonly storeFactory: (root: string) => ProjectStorePort) {}
  async execute(cwd: string, nodeId?: string): Promise<Relation[]> {
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    return nodeId ? store.listRelationsFor(nodeId) : store.listRelations();
  }
}
