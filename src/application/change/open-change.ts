import type { Change } from "../../domain/change/change.js";
import { assertChangeInvariant } from "../../domain/change/change.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { IdGeneratorPort } from "../../ports/id-generator.js";
import type { ProjectStorePort } from "../../ports/project-store.js";

export class OpenChange {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root: string) => ProjectStorePort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  async execute(cwd: string, title: string, intent?: string): Promise<Change> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) throw new Error("change title cannot be empty");
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    await store.loadProject();
    const change: Change = {
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
