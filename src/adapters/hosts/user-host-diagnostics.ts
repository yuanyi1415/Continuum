import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { HostDiagnostic, HostDiagnosticsPort } from "../../ports/maintenance.js";
import { CodexCapabilityDetector } from "./codex/codex-capability-detector.js";
import { OmpCapabilityDetector } from "./omp/omp-capability-detector.js";

export class UserHostDiagnostics implements HostDiagnosticsPort {
  constructor(
    private readonly ompAssetPath: string,
    private readonly repositoryRoot?: string,
    private readonly detectCodex = () => new CodexCapabilityDetector().detect(),
    private readonly detectOmp = () => new OmpCapabilityDetector().detect(),
    private readonly home: () => string = homedir,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  private codexHome(): string { return resolve(this.env.CODEX_HOME?.trim() || join(this.home(), ".codex")); }
  private ompAgentDir(): string { return resolve(this.env.PI_CODING_AGENT_DIR?.trim() || join(this.home(), ".omp", "agent")); }

  async inspect(): Promise<HostDiagnostic[]> {
    const out: HostDiagnostic[] = [];

    const codex = await this.detectCodex();
    const codexHome = this.codexHome();
    const hooksPath = join(codexHome, "hooks.json");
    const configPath = join(codexHome, "config.toml");
    const hooksPresent = existsSync(hooksPath) && /continuum/i.test(readFileSync(hooksPath, "utf8")) && /host[^\n]*codex[^\n]*hook[^\n]*--global/i.test(readFileSync(hooksPath, "utf8"));
    const configText = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
    const configPresent = /^\s*hooks\s*=\s*true\s*$/m.test(configText);
    const mcpPresent = /^\s*\[\s*mcp_servers\.(?:continuum|"continuum"|'continuum')\s*\]\s*$/m.test(configText);
    const globalPresent = hooksPresent && configPresent && mcpPresent;
    const legacyCodex = Boolean(this.repositoryRoot && existsSync(join(this.repositoryRoot, ".codex", "hooks.json")) && /continuum/i.test(readFileSync(join(this.repositoryRoot, ".codex", "hooks.json"), "utf8")));
    const codexWarn = codex.installed && (!globalPresent || legacyCodex);
    out.push({
      host: "codex",
      level: codexWarn ? "WARN" : "PASS",
      installed: codex.installed,
      adapterPresent: globalPresent,
      message: !codex.installed
        ? "Codex is not installed; global bridge diagnostics are informational."
        : !globalPresent
          ? "Codex is installed but the Continuum user-level bridge is missing or incomplete. Run continuum setup."
          : legacyCodex
            ? "Codex global bridge is installed; a legacy project-local Continuum hook also exists. Global bridge will defer to it until the project adapter is removed."
            : `Codex ${codex.version ?? ""} global Continuum bridge is installed.`.trim(),
      details: { codexHome, hooksPath, configPath, mcpPresent, legacyProjectAdapter: legacyCodex, version: codex.version, lifecycleHooks: codex.lifecycleHooks, structuredDecision: codex.structuredDecision, diagnostics: codex.diagnostics },
    });

    const omp = await this.detectOmp();
    const agentDir = this.ompAgentDir();
    const extensionPath = join(agentDir, "extensions", "continuum.ts");
    const globalOmpPresent = existsSync(extensionPath);
    let adapterCurrent: boolean | undefined;
    if (globalOmpPresent && existsSync(this.ompAssetPath)) adapterCurrent = readFileSync(extensionPath, "utf8") === readFileSync(this.ompAssetPath, "utf8");
    const legacyOmp = Boolean(this.repositoryRoot && existsSync(join(this.repositoryRoot, ".omp", "extensions", "continuum.ts")));
    const ompWarn = omp.installed && (!globalOmpPresent || adapterCurrent === false || legacyOmp);
    out.push({
      host: "omp",
      level: ompWarn ? "WARN" : "PASS",
      installed: omp.installed,
      adapterPresent: globalOmpPresent,
      ...(adapterCurrent !== undefined ? { adapterCurrent } : {}),
      message: !omp.installed
        ? "OMP is not installed; global bridge diagnostics are informational."
        : !globalOmpPresent
          ? "OMP is installed but the Continuum user-level extension is missing. Run continuum setup."
          : adapterCurrent === false
            ? "OMP global Continuum extension differs from the current packaged bridge. Run continuum setup to refresh it."
            : legacyOmp
              ? "OMP global bridge is installed; a legacy project-local Continuum extension also exists. Global bridge will defer to the project extension until it is removed."
              : `OMP ${omp.version ?? ""} global Continuum bridge is installed.`.trim(),
      details: { agentDir, extensionPath, legacyProjectAdapter: legacyOmp, version: omp.version, lifecycleHooks: omp.lifecycleHooks, projectExtensions: omp.projectExtensions, diagnostics: omp.diagnostics },
    });

    return out;
  }
}
