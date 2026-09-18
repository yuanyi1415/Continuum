import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
function shellQuote(value) { return `'${value.replaceAll("'", `'"'"'`)}'`; }
function hookEntry(command) { return { hooks: [{ type: "command", command, statusMessage: "Continuum" }] }; }
const AGENTS_START = "<!-- continuum:codex:start -->";
const AGENTS_END = "<!-- continuum:codex:end -->";
const AGENTS_BLOCK = `${AGENTS_START}
## Continuum host integration

When Continuum reports a pending DECISION, the user may send \`continuum decision\`. When that intent is injected by the Continuum hook, immediately call the MCP tool \`continuum_decision\` to ask the user through Codex structured elicitation. Never choose an option for the user. If structured elicitation is unavailable, obey the deterministic Continuum Hook Gate fallback. A Continuum design conflict pauses formal implementation but does not prevent normal design/research discussion. After relevant Spec/ADR changes, Continuum may ask the user whether to restart the Work from the latest design. Never choose that restart decision on the user's behalf.
${AGENTS_END}`;
function mergeAgents(text) {
    const start = text.indexOf(AGENTS_START), end = text.indexOf(AGENTS_END);
    if (start >= 0 && end >= start)
        return `${text.slice(0, start).trimEnd()}${text.slice(0, start).trim() ? "\n\n" : ""}${AGENTS_BLOCK}${text.slice(end + AGENTS_END.length)}`.trimEnd() + "\n";
    const prefix = text.trimEnd();
    return `${prefix}${prefix ? "\n\n" : ""}${AGENTS_BLOCK}\n`;
}
function enableHooksToml(text) {
    if (/^\s*hooks\s*=\s*true\s*$/m.test(text))
        return { text, changed: false };
    const lines = text.split(/\r?\n/);
    let features = -1;
    for (let i = 0; i < lines.length; i++)
        if (lines[i].trim() === "[features]") {
            features = i;
            break;
        }
    if (features < 0) {
        const prefix = text.trimEnd();
        return { text: `${prefix}${prefix ? "\n\n" : ""}[features]\nhooks = true\n`, changed: true };
    }
    let end = lines.length;
    for (let i = features + 1; i < lines.length; i++)
        if (/^\s*\[.*\]\s*$/.test(lines[i])) {
            end = i;
            break;
        }
    for (let i = features + 1; i < end; i++)
        if (/^\s*hooks\s*=/.test(lines[i])) {
            lines[i] = "hooks = true";
            return { text: lines.join("\n"), changed: true };
        }
    lines.splice(features + 1, 0, "hooks = true");
    return { text: lines.join("\n"), changed: true };
}
export class CodexHostInstaller {
    async install(repositoryRoot, cliEntryPath, mcpServerPath, registerMcp = true) {
        const codexDir = join(repositoryRoot, ".codex");
        await mkdir(codexDir, { recursive: true });
        const hooksPath = join(codexDir, "hooks.json"), configPath = join(codexDir, "config.toml");
        const command = `node ${shellQuote(resolve(cliEntryPath))} host codex hook`;
        let hooks = { hooks: {} };
        try {
            hooks = JSON.parse(await readFile(hooksPath, "utf8"));
        }
        catch { }
        if (!hooks || typeof hooks !== "object")
            hooks = {};
        if (!hooks.hooks || typeof hooks.hooks !== "object")
            hooks.hooks = {};
        let hookInstalled = false;
        for (const event of ["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd"]) {
            const existing = Array.isArray(hooks.hooks[event]) ? hooks.hooks[event] : [];
            const present = existing.some((group) => Array.isArray(group?.hooks) && group.hooks.some((hook) => hook?.type === "command" && hook?.command === command));
            if (!present) {
                existing.push(hookEntry(command));
                hooks.hooks[event] = existing;
                hookInstalled = true;
            }
        }
        await writeFile(hooksPath, JSON.stringify(hooks, null, 2) + "\n", "utf8");
        let config = "";
        try {
            config = await readFile(configPath, "utf8");
        }
        catch { }
        const enabled = enableHooksToml(config);
        if (enabled.changed || !config)
            await writeFile(configPath, enabled.text, "utf8");
        const instructionsPath = join(repositoryRoot, "AGENTS.md");
        let agents = "";
        try {
            agents = await readFile(instructionsPath, "utf8");
        }
        catch { }
        await writeFile(instructionsPath, mergeAgents(agents), "utf8");
        const warnings = [];
        let mcp = "skipped";
        if (registerMcp) {
            try {
                try {
                    await execFileAsync("codex", ["mcp", "get", "continuum"], { encoding: "utf8" });
                    mcp = "existing";
                }
                catch {
                    await execFileAsync("codex", ["mcp", "add", "continuum", "--", "node", resolve(mcpServerPath), resolve(cliEntryPath)], { encoding: "utf8" });
                    mcp = "installed";
                }
            }
            catch (error) {
                mcp = "unavailable";
                warnings.push(`Could not register Codex MCP server: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return { hooksPath, configPath, instructionsPath, hookInstalled, hooksEnabled: true, mcp, warnings };
    }
}
//# sourceMappingURL=codex-host-installer.js.map