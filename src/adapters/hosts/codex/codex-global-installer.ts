import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface CodexGlobalInstallResult {
  scope: "user";
  codexHome: string;
  hooksPath: string;
  configPath: string;
  hookInstalled: boolean;
  hooksEnabled: boolean;
  mcp: "installed" | "existing";
  warnings: string[];
}

function shellQuote(value: string): string { return `'${value.replaceAll("'", `'"'"'`)}'`; }
function hookEntry(command: string) { return { hooks: [{ type: "command", command, statusMessage: "Continuum" }] }; }

function enableHooksToml(text: string): { text: string; changed: boolean } {
  if (/^\s*hooks\s*=\s*true\s*$/m.test(text)) return { text, changed: false };
  const lines = text.split(/\r?\n/);
  let features = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].trim() === "[features]") { features = i; break; }
  if (features < 0) {
    const prefix = text.trimEnd();
    return { text: `${prefix}${prefix ? "\n\n" : ""}[features]\nhooks = true\n`, changed: true };
  }
  let end = lines.length;
  for (let i = features + 1; i < lines.length; i++) if (/^\s*\[.*\]\s*$/.test(lines[i])) { end = i; break; }
  for (let i = features + 1; i < end; i++) if (/^\s*hooks\s*=/.test(lines[i])) {
    if (lines[i].trim() === "hooks = true") return { text, changed: false };
    lines[i] = "hooks = true";
    return { text: lines.join("\n"), changed: true };
  }
  lines.splice(features + 1, 0, "hooks = true");
  return { text: lines.join("\n"), changed: true };
}

function tomlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n").replaceAll("\r", "\\r")}"`;
}

function isContinuumMcpHeader(line: string): boolean {
  return /^\s*\[\s*mcp_servers\.(?:continuum|"continuum"|'continuum')(?:\.|\])/.test(line);
}

function upsertContinuumMcpToml(text: string, nodePath: string, mcpServerPath: string, cliEntryPath: string): { text: string; changed: boolean } {
  const desired = [
    "[mcp_servers.continuum]",
    `command = ${tomlString(nodePath)}`,
    `args = [${tomlString(resolve(mcpServerPath))}, ${tomlString(resolve(cliEntryPath))}]`,
  ].join("\n");

  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let removing = false;
  let found = false;
  for (const line of lines) {
    const header = /^\s*\[.*\]\s*$/.test(line);
    if (!removing && isContinuumMcpHeader(line)) {
      removing = true;
      found = true;
      continue;
    }
    if (removing && header) {
      if (isContinuumMcpHeader(line)) continue;
      removing = false;
    }
    if (!removing) kept.push(line);
  }

  const base = kept.join("\n").trimEnd();
  const next = `${base}${base ? "\n\n" : ""}${desired}\n`;
  const normalizedCurrent = text.trimEnd() + (text.trim() ? "\n" : "");
  return { text: next, changed: next !== normalizedCurrent || !found };
}

export class CodexGlobalInstaller {
  constructor(
    private readonly home: () => string = homedir,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  codexHome(): string {
    return resolve(this.env.CODEX_HOME?.trim() || join(this.home(), ".codex"));
  }

  async install(cliEntryPath: string, mcpServerPath: string, registerMcp = true): Promise<CodexGlobalInstallResult> {
    const codexHome = this.codexHome();
    await mkdir(codexHome, { recursive: true });
    const hooksPath = join(codexHome, "hooks.json");
    const configPath = join(codexHome, "config.toml");
    const command = `${shellQuote(process.execPath)} ${shellQuote(resolve(cliEntryPath))} host codex hook --global`;

    let hooks: any = { hooks: {} };
    try { hooks = JSON.parse(await readFile(hooksPath, "utf8")); } catch {}
    if (!hooks || typeof hooks !== "object") hooks = {};
    if (!hooks.hooks || typeof hooks.hooks !== "object") hooks.hooks = {};
    let hookInstalled = false;
    for (const event of ["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd"]) {
      const existing = Array.isArray(hooks.hooks[event]) ? hooks.hooks[event] : [];
      const filtered = existing.filter((group: any) => !Array.isArray(group?.hooks) || !group.hooks.some((hook: any) => hook?.type === "command" && /continuum/i.test(String(hook?.command ?? "")) && /host\s+codex\s+hook/i.test(String(hook?.command ?? ""))));
      const hadExact = existing.some((group: any) => Array.isArray(group?.hooks) && group.hooks.some((hook: any) => hook?.type === "command" && hook?.command === command));
      if (!hadExact || filtered.length !== existing.length - (hadExact ? 1 : 0)) hookInstalled = true;
      filtered.push(hookEntry(command));
      hooks.hooks[event] = filtered;
    }
    await writeFile(hooksPath, JSON.stringify(hooks, null, 2) + "\n", "utf8");

    let config = "";
    try { config = await readFile(configPath, "utf8"); } catch {}
    const enabled = enableHooksToml(config);
    let nextConfig = enabled.text;
    let mcp: CodexGlobalInstallResult["mcp"] = "existing";
    if (registerMcp) {
      const updated = upsertContinuumMcpToml(nextConfig, process.execPath, mcpServerPath, cliEntryPath);
      nextConfig = updated.text;
      mcp = updated.changed ? "installed" : "existing";
    }
    if (nextConfig !== config) await writeFile(configPath, nextConfig, "utf8");

    return { scope: "user", codexHome, hooksPath, configPath, hookInstalled, hooksEnabled: true, mcp, warnings: [] };
  }
}
