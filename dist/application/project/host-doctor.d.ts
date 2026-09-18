import type { GitPort } from "../../ports/git.js";
import type { HostDiagnostic, HostDiagnosticsPort } from "../../ports/maintenance.js";
export declare class HostDoctor {
    private readonly git;
    private readonly factory;
    constructor(git: GitPort, factory: (root: string) => HostDiagnosticsPort);
    execute(cwd: string): Promise<HostDiagnostic[]>;
}
