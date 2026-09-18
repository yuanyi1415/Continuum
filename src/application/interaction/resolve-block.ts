import type { InteractionResult } from "../../domain/interaction/interaction.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";

export interface ResolveBlockInput {
  interactionId: string;
  host: string;
}

export class ResolveBlock {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root: string) => ProjectStorePort,
    private readonly runtimeFactory: (root: string) => RuntimeStorePort,
    private readonly clock: ClockPort,
  ) {}

  async execute(cwd: string, input: ResolveBlockInput): Promise<InteractionResult> {
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    await store.loadProject();
    const runtime = this.runtimeFactory(facts.root);
    const request = await runtime.loadPendingInteraction(input.interactionId);
    if (!request || request.type !== "BLOCK") {
      throw new ContinuumError("CONTINUUM_INTERACTION_NOT_FOUND", `Pending BLOCK interaction not found: ${input.interactionId}`, true);
    }

    const blockPhase = request.context?.blockPhase;
    if (blockPhase !== "design") {
      throw new ContinuumError("CONTINUUM_BLOCKED", "Return to design before resolving the BLOCK; the blocker has not entered design-review phase.", true, { interaction: request });
    }

    const binding = await runtime.getWorktreeBinding(facts.worktreeIdentity);
    if (binding) {
      throw new ContinuumError("CONTINUUM_BLOCKED", "Return to design before resolving the BLOCK; managed implementation work is still bound to this worktree.", true, { interaction: request, binding });
    }

    const result: InteractionResult = {
      requestId: request.id,
      action: "resolve",
      host: input.host,
      resolvedAt: this.clock.nowIso(),
    };
    await runtime.resolveInteraction(result);
    return result;
  }
}
