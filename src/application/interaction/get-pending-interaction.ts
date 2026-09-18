import type { InteractionRequest } from "../../domain/interaction/interaction.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";

export class GetPendingInteraction {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root: string) => ProjectStorePort,
    private readonly runtimeFactory: (root: string) => RuntimeStorePort,
  ) {}

  async execute(cwd: string, preferredType?: "DECISION" | "BLOCK"): Promise<InteractionRequest | null> {
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    await store.loadProject();
    const runtime = this.runtimeFactory(facts.root);
    const health = await runtime.health();
    if (!health.available) return null;
    const pending = await runtime.listPendingInteractions();
    const rank = (item: InteractionRequest): number => item.type === "BLOCK" ? 0 : item.type === "DECISION" ? 1 : 2;
    const filtered = preferredType ? pending.filter(item => item.type === preferredType) : pending.filter(item => item.type === "BLOCK" || item.type === "DECISION");
    return filtered.sort((a,b) => rank(a)-rank(b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0] ?? null;
  }
}
