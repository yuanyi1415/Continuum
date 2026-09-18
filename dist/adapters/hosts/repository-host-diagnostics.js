import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CodexCapabilityDetector } from "./codex/codex-capability-detector.js";
import { OmpCapabilityDetector } from "./omp/omp-capability-detector.js";
export class RepositoryHostDiagnostics {
    repositoryRoot;
    ompAssetPath;
    detectCodex;
    detectOmp;
    constructor(repositoryRoot, ompAssetPath, detectCodex = () => new CodexCapabilityDetector().detect(), detectOmp = () => new OmpCapabilityDetector().detect()) {
        this.repositoryRoot = repositoryRoot;
        this.ompAssetPath = ompAssetPath;
        this.detectCodex = detectCodex;
        this.detectOmp = detectOmp;
    }
    async inspect() {
        const out = [];
        const codex = await this.detectCodex();
        const hooksPath = join(this.repositoryRoot, ".codex", "hooks.json");
        const configPath = join(this.repositoryRoot, ".codex", "config.toml");
        const hooksPresent = existsSync(hooksPath) && /continuum/i.test(readFileSync(hooksPath, "utf8"));
        const configPresent = existsSync(configPath) && /^\s*hooks\s*=\s*true\s*$/m.test(readFileSync(configPath, "utf8"));
        const codexAdapter = hooksPresent && configPresent;
        out.push({
            host: "codex",
            level: codex.installed && !codexAdapter ? "WARN" : "PASS",
            installed: codex.installed,
            adapterPresent: codexAdapter,
            message: codex.installed ? (codexAdapter ? `Codex ${codex.version ?? ""} adapter is installed.`.trim() : "Codex is installed but the repository adapter is missing or incomplete.") : "Codex is not installed; adapter diagnostics are informational.",
            details: { version: codex.version, lifecycleHooks: codex.lifecycleHooks, structuredDecision: codex.structuredDecision, diagnostics: codex.diagnostics },
        });
        const omp = await this.detectOmp();
        const extensionPath = join(this.repositoryRoot, ".omp", "extensions", "continuum.ts");
        const adapterPresent = existsSync(extensionPath);
        let adapterCurrent;
        if (adapterPresent && existsSync(this.ompAssetPath))
            adapterCurrent = readFileSync(extensionPath, "utf8") === readFileSync(this.ompAssetPath, "utf8");
        out.push({
            host: "omp",
            level: omp.installed && (!adapterPresent || adapterCurrent === false) ? "WARN" : "PASS",
            installed: omp.installed,
            adapterPresent,
            ...(adapterCurrent !== undefined ? { adapterCurrent } : {}),
            message: omp.installed ? (!adapterPresent ? "OMP is installed but the Continuum project extension is missing." : adapterCurrent === false ? "OMP Continuum extension differs from the current packaged adapter." : `OMP ${omp.version ?? ""} adapter is installed.`.trim()) : "OMP is not installed; adapter diagnostics are informational.",
            details: { version: omp.version, lifecycleHooks: omp.lifecycleHooks, projectExtensions: omp.projectExtensions, diagnostics: omp.diagnostics },
        });
        return out;
    }
}
//# sourceMappingURL=repository-host-diagnostics.js.map