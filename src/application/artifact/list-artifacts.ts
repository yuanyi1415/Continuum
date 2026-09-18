import type { ArtifactRef } from "../../domain/artifact/artifact-ref.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";

export class ListArtifacts {
  constructor(private readonly git: GitPort, private readonly storeFactory: (root: string) => ProjectStorePort) {}
  async execute(cwd: string): Promise<ArtifactRef[]> {
    const facts = await this.git.inspect(cwd);
    return this.storeFactory(facts.root).listArtifacts();
  }
}
