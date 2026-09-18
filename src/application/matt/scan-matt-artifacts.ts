import type { GitPort } from "../../ports/git.js";
import type { MattArtifactObserverPort, ObservedMattArtifact } from "../../ports/matt-artifact-observer.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RegisterArtifact } from "../artifact/register-artifact.js";
import type { RegisterRelation } from "../relation/register-relation.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";

export interface ScanMattArtifactsResult {
  discovered: ObservedMattArtifact[];
  registered: string[];
  existing: string[];
  linkedToChange: string[];
}

export class ScanMattArtifacts {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root: string)=>ProjectStorePort,
    private readonly observerFactory: (root: string)=>MattArtifactObserverPort,
    private readonly registerArtifact: RegisterArtifact,
    private readonly registerRelation: RegisterRelation,
  ) {}

  async execute(cwd: string, changeId?: string): Promise<ScanMattArtifactsResult> {
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    if (changeId && !(await store.hasChange(changeId))) {
      throw new ContinuumError("CONTINUUM_CHANGE_NOT_FOUND", `Change not found: ${changeId}`, true);
    }
    const discovered = await this.observerFactory(facts.root).observe();
    const registered: string[] = [], existing: string[] = [], linkedToChange: string[] = [];
    for (const item of discovered) {
      const result = await this.registerArtifact.execute(facts.root, {
        artifactId: item.artifactId,
        type: item.type,
        authority: "git-file",
        locator: item.locator,
        title: item.title,
        metadata: { observed_by: "matt-local-observer" },
      });
      (result.created ? registered : existing).push(item.artifactId);
      if (changeId && (item.type === "spec" || item.type === "ticket")) {
        const rel = await this.registerRelation.execute(facts.root, { from:item.artifactId, to:changeId, type:"belongs_to", routing:"required" });
        if (rel.created) linkedToChange.push(item.artifactId);
      }
    }
    return { discovered, registered, existing, linkedToChange };
  }
}
