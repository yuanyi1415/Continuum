import type { GitPort } from "../../ports/git.js";
import type { HostDiagnostic, HostDiagnosticsPort } from "../../ports/maintenance.js";

export class HostDoctor {
  constructor(private readonly git: GitPort, private readonly factory: (root: string) => HostDiagnosticsPort) {}
  async execute(cwd: string): Promise<HostDiagnostic[]> {
    const facts = await this.git.inspect(cwd);
    return this.factory(facts.root).inspect();
  }
}
