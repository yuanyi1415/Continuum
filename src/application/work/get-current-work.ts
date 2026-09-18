import type { WorkBinding } from "../../domain/work/work-binding.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";

export interface GetCurrentWorkInput { sessionId?: string; host?: string; }
export interface CurrentWorkResult {
  mode: "aware" | "managed";
  suppressed: boolean;
  binding: WorkBinding | null;
  sessionBound: boolean;
}

export class GetCurrentWork {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root: string) => ProjectStorePort,
    private readonly runtimeFactory: (root: string) => RuntimeStorePort,
    private readonly clock: ClockPort,
  ) {}

  async execute(cwd: string, input: GetCurrentWorkInput = {}): Promise<CurrentWorkResult> {
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    await store.loadProject();
    const runtime = this.runtimeFactory(facts.root);
    const health = await runtime.health();
    if (!health.available) return { mode: "aware", suppressed: false, binding: null, sessionBound: false };

    const binding = await runtime.getWorktreeBinding(facts.worktreeIdentity);
    if (!input.sessionId || !input.host) return { mode: binding ? "managed" : "aware", suppressed: false, binding, sessionBound: false };

    const suppressed = await runtime.isSessionSuppressed(input.sessionId, input.host);
    if (suppressed) return { mode: "aware", suppressed: true, binding, sessionBound: false };
    if (!binding) return { mode: "aware", suppressed: false, binding: null, sessionBound: false };

    await runtime.bindSession({ sessionId: input.sessionId, host: input.host, worktreeId: facts.worktreeIdentity, boundAt: this.clock.nowIso() });
    return { mode: "managed", suppressed: false, binding, sessionBound: true };
  }
}
