#!/usr/bin/env node
import { createApp } from "./composition-root.js";
import { printJson, printStatus } from "./output.js";
import { ContinuumError } from "../shared/errors/continuum-error.js";
import { decodeCodexHook, encodeCodexHook } from "../adapters/hosts/codex/codex-hook-protocol.js";
import { CodexCapabilityDetector } from "../adapters/hosts/codex/codex-capability-detector.js";
import { CodexHostInstaller } from "../adapters/hosts/codex/codex-host-installer.js";
import { decodeOmpEvent, encodeOmpEvent } from "../adapters/hosts/omp/omp-extension-protocol.js";
import { OmpCapabilityDetector } from "../adapters/hosts/omp/omp-capability-detector.js";
import { OmpHostInstaller } from "../adapters/hosts/omp/omp-host-installer.js";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
function flag(args, name) {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
}
function has(args, name) { return args.includes(name); }
function requireArg(value, message) { if (!value)
    throw new Error(message); return value; }
async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
}
const artifactTypes = new Set(["context", "adr", "spec", "ticket", "review", "evidence", "document", "other"]);
const relationTypes = new Set(["belongs_to", "blocked_by", "governed_by", "domain_context", "evidence", "supersedes"]);
const relationRouting = new Set(["required", "optional", "historical"]);
const changeStatuses = new Set(["active", "closed", "superseded"]);
function version() {
    return "Continuum 1.0.1";
}
function help() {
    return `Continuum

Usage:
  continuum init [--name NAME] [--json]
  continuum status [--json]
  continuum doctor [--recover] [--json]
  continuum migrate [--json]
  continuum archive [--allow-incomplete] [--with-history] [--json]
  continuum archive verify <archive-path> [--json]

  continuum change open <title> [--intent TEXT] [--json]
  continuum change list [--status active|closed|superseded] [--json]
  continuum change show <change-id> [--json]

  continuum artifact register <repo-relative-path> --type <type> [--authority git-file] [--id ID] [--title TITLE] [--change CHANGE] [--json]
  continuum artifact list [--json]

  continuum relation add <from> <type> <to> [--routing required|optional|historical] [--json]
  continuum relation list [--for NODE] [--json]

  continuum work bind <ticket> [--session ID --host HOST] [--source SOURCE] [--json]
  continuum work current [--session ID --host HOST] [--json]
  continuum work suppress-session --session ID --host HOST [--reason TEXT] [--json]

  continuum block return-to-design <interaction-id> [--session ID --host HOST] [--json]
  continuum block resolve <interaction-id> --host HOST [--json]

  continuum matt scan [--change CHANGE] [--json]
  continuum context <work> [--max-items N] [--max-chars N] [--json]

  continuum reconcile [--json]
  continuum lifecycle checkpoint [--source SOURCE] [--session ID --host HOST] [--json]
  continuum lifecycle install-git-hook [--command COMMAND] [--json]

  continuum host install codex [--skip-mcp] [--json]
  continuum host install omp [--json]
  continuum host doctor [--json]
  continuum host codex capabilities [--json]
  continuum host codex hook
  continuum host codex interaction next [--type DECISION|BLOCK] [--json]
  continuum host codex interaction resolve <id> [--option OPTION] [--action accept|cancel|dismiss|unavailable|resolve] [--json]
  continuum host omp capabilities [--json]
  continuum host omp event
  continuum host omp interaction next [--type DECISION|BLOCK] [--json]
  continuum host omp interaction resolve <id> [--option OPTION] [--action accept|cancel|dismiss|unavailable|resolve] [--json]`;
}
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const json = has(args, "--json");
    const app = createApp();
    const cwd = process.cwd();
    if (!command || command === "help" || command === "--help" || command === "-h") {
        console.log(help());
        return;
    }
    if (command === "--version" || command === "-v" || command === "version") {
        console.log(version());
        return;
    }
    if (command === "init") {
        const result = await app.init.execute(cwd, flag(args, "--name"));
        const data = { project_id: result.project.projectId, name: result.project.name, snapshot_id: result.snapshot.snapshotId, repository_identity: result.project.repository.identity, revision: result.snapshot.baselines[0].revision };
        if (json)
            printJson({ ok: true, data, warnings: [], interaction: null });
        else {
            console.log(`Initialized Continuum for ${result.project.name}`);
            console.log(`Project: ${result.project.projectId}`);
            console.log(`Snapshot: ${result.snapshot.snapshotId}`);
        }
        return;
    }
    if (command === "status") {
        const status = await app.status.execute(cwd);
        if (json)
            printJson({ ok: true, data: status, warnings: status.runtime.available ? [] : ["runtime.db is not present; durable project state remains available."], interaction: null });
        else
            printStatus(status);
        return;
    }
    if (command === "doctor") {
        const result = await app.doctor.execute(cwd, { recover: has(args, "--recover") });
        if (json)
            printJson({ ok: result.ok, data: result, warnings: result.checks.filter(c => c.level === "WARN").map(c => c.message), interaction: null });
        else {
            for (const c of result.checks)
                console.log(`${c.level.padEnd(4)} ${c.name}${c.repaired ? " [repaired]" : ""}: ${c.message}`);
        }
        if (!result.ok)
            process.exitCode = 2;
        return;
    }
    if (command === "migrate") {
        const result = await app.migrate.execute(cwd);
        const warnings = [];
        if (json)
            printJson({ ok: true, data: result, warnings, interaction: null });
        else {
            console.log(`Durable: ${result.durable.migratedFiles.length ? `migrated ${result.durable.migratedFiles.length} file(s) to v${result.durable.toVersion}` : `already v${result.durable.toVersion}`}`);
            console.log(`Runtime: ${result.runtime.applied.length ? `applied migrations ${result.runtime.applied.join(", ")}` : `already v${result.runtime.toVersion}`}`);
            if (result.durable.backupDirectory)
                console.log(`Backup: ${result.durable.backupDirectory}`);
        }
        return;
    }
    if (command === "archive") {
        if (args[1] === "verify") {
            const archivePath = requireArg(args[2], "Usage: continuum archive verify <archive-path>");
            const result = await app.archive.verify.execute(archivePath);
            const data = { archive_path: result.archivePath, archive_id: result.archiveId ?? null, status: result.status ?? null, checked_files: result.checkedFiles, failures: result.failures };
            if (json)
                printJson({ ok: result.ok, data, warnings: result.failures, interaction: null });
            else {
                console.log(`${result.ok ? "PASS" : "FAIL"} Archive ${result.archiveId ?? archivePath}`);
                console.log(`Path: ${result.archivePath}`);
                console.log(`Checked files: ${result.checkedFiles}`);
                for (const failure of result.failures)
                    console.log(`FAIL ${failure}`);
            }
            if (!result.ok)
                process.exitCode = 2;
            return;
        }
        const result = await app.archive.create.execute(cwd, { allowIncomplete: has(args, "--allow-incomplete"), withHistory: has(args, "--with-history") });
        const warnings = result.manifest.status === "incomplete" ? ["Archive is incomplete; see manifest missing_or_external."] : [];
        if (json)
            printJson({ ok: true, data: { archive_path: result.archivePath, archive_id: result.manifest.archiveId, status: result.manifest.status, final_snapshot: result.manifest.finalSnapshot, revision: result.manifest.repository.revision, with_history: Boolean(result.manifest.historyBundlePath), verified: result.verified, checked_files: result.checkedFiles }, warnings, interaction: null });
        else {
            console.log(`Archived ${result.manifest.projectName} · ${result.manifest.status}`);
            console.log(`Archive: ${result.archivePath}`);
            console.log(`Final Snapshot: ${result.manifest.finalSnapshot}`);
            console.log(`Revision: ${result.manifest.repository.revision}`);
            console.log(`Integrity: ${result.verified ? "verified" : "failed"} (${result.checkedFiles} files)`);
            if (result.manifest.historyBundlePath)
                console.log(`Git history: ${result.manifest.historyBundlePath}`);
        }
        return;
    }
    if (command === "change") {
        const action = args[1];
        if (action === "open") {
            const title = requireArg(args[2], "Usage: continuum change open <title>");
            const change = await app.change.open.execute(cwd, title, flag(args, "--intent"));
            if (json)
                printJson({ ok: true, data: change, warnings: [], interaction: null });
            else
                console.log(`Opened ${change.changeId} · ${change.title}`);
            return;
        }
        if (action === "list") {
            const rawStatus = flag(args, "--status");
            if (rawStatus && !changeStatuses.has(rawStatus))
                throw new Error(`Invalid change status: ${rawStatus}`);
            const changes = await app.change.list.execute(cwd, rawStatus);
            if (json)
                printJson({ ok: true, data: changes, warnings: [], interaction: null });
            else
                for (const change of changes)
                    console.log(`${change.changeId}  ${change.status.padEnd(10)} ${change.title}`);
            return;
        }
        if (action === "show") {
            const change = await app.change.get.execute(cwd, requireArg(args[2], "Usage: continuum change show <change-id>"));
            if (json)
                printJson({ ok: true, data: change, warnings: [], interaction: null });
            else
                console.log(JSON.stringify(change, null, 2));
            return;
        }
        if (action === "close") {
            const changeId = requireArg(args[2], "Usage: continuum change close <change-id>");
            const result = await app.reconcile.change.execute(cwd, changeId);
            if (json)
                printJson({ ok: true, data: result, warnings: [], interaction: null });
            else
                console.log(`Closed ${result.change.changeId} · snapshot ${result.snapshot.snapshotId} · ${result.status.toLowerCase()}`);
            return;
        }
        throw new Error("Usage: continuum change <open|list|show|close>");
    }
    if (command === "artifact") {
        const action = args[1];
        if (action === "register") {
            const locator = requireArg(args[2], "Usage: continuum artifact register <repo-relative-path> --type <type>");
            const rawType = requireArg(flag(args, "--type"), "--type is required");
            if (!artifactTypes.has(rawType))
                throw new Error(`Invalid artifact type: ${rawType}`);
            const result = await app.artifact.register.execute(cwd, { artifactId: flag(args, "--id"), type: rawType, authority: flag(args, "--authority") ?? "git-file", locator, title: flag(args, "--title") });
            const changeId = flag(args, "--change");
            let relation = undefined;
            if (changeId)
                relation = await app.relation.register.execute(cwd, { from: result.artifact.artifactId, to: changeId, type: "belongs_to", routing: "required" });
            const data = { ...result, ...(relation ? { relation } : {}) };
            if (json)
                printJson({ ok: true, data, warnings: [], interaction: null });
            else
                console.log(`${result.created ? "Registered" : "Found"} ${result.artifact.artifactId} · ${result.artifact.locator}`);
            return;
        }
        if (action === "list") {
            const artifacts = await app.artifact.list.execute(cwd);
            if (json)
                printJson({ ok: true, data: artifacts, warnings: [], interaction: null });
            else
                for (const artifact of artifacts)
                    console.log(`${artifact.artifactId}  ${artifact.type.padEnd(9)} ${artifact.locator}`);
            return;
        }
        throw new Error("Usage: continuum artifact <register|list>");
    }
    if (command === "work") {
        const action = args[1];
        if (action === "bind") {
            const targetArtifactId = requireArg(args[2], "Usage: continuum work bind <ticket>");
            const sessionId = flag(args, "--session");
            const host = flag(args, "--host");
            if ((sessionId && !host) || (!sessionId && host))
                throw new Error("--session and --host must be provided together");
            const result = await app.work.bind.execute(cwd, { targetArtifactId, bindingSource: flag(args, "--source") ?? "explicit-cli", ...(sessionId && host ? { sessionId, host } : {}) });
            if (json)
                printJson({ ok: true, data: result, warnings: [], interaction: null });
            else
                console.log(`${result.created ? "Bound" : "Resumed"} ${result.binding.targetArtifactId} · baseline ${result.binding.workStartRevision}`);
            return;
        }
        if (action === "current") {
            const sessionId = flag(args, "--session");
            const host = flag(args, "--host");
            if ((sessionId && !host) || (!sessionId && host))
                throw new Error("--session and --host must be provided together");
            const result = await app.work.current.execute(cwd, sessionId && host ? { sessionId, host } : {});
            if (json)
                printJson({ ok: true, data: result, warnings: [], interaction: null });
            else if (result.binding)
                console.log(`Continuum · ${result.mode} · ${result.binding.targetArtifactId}${result.suppressed ? " · suppressed" : ""}`);
            else
                console.log(`Continuum · ${result.mode}`);
            return;
        }
        if (action === "suppress-session") {
            const sessionId = requireArg(flag(args, "--session"), "--session is required");
            const host = requireArg(flag(args, "--host"), "--host is required");
            await app.work.suppressSession.execute(cwd, { sessionId, host, reason: flag(args, "--reason") });
            const data = { sessionId, host, suppressed: true };
            if (json)
                printJson({ ok: true, data, warnings: [], interaction: null });
            else
                console.log(`Suppressed Continuum for ${host}/${sessionId}`);
            return;
        }
        throw new Error("Usage: continuum work <bind|current|suppress-session>");
    }
    if (command === "block") {
        const action = args[1];
        if (action === "return-to-design") {
            const interactionId = requireArg(args[2], "Usage: continuum block return-to-design <interaction-id>");
            const sessionId = flag(args, "--session"), host = flag(args, "--host");
            if ((sessionId && !host) || (!sessionId && host))
                throw new Error("--session and --host must be provided together");
            const result = await app.interaction.returnToDesign.execute(cwd, { interactionId, ...(sessionId && host ? { sessionId, host } : {}) });
            if (json)
                printJson({ ok: true, data: result, warnings: [], interaction: result.interaction });
            else
                console.log(`Returned to design · blocker ${result.interaction.id} remains active${result.releasedTargetArtifactId ? ` · released ${result.releasedTargetArtifactId}` : ""}`);
            return;
        }
        if (action === "resolve") {
            const interactionId = requireArg(args[2], "Usage: continuum block resolve <interaction-id> --host HOST");
            const host = requireArg(flag(args, "--host"), "--host is required");
            const result = await app.interaction.resolveBlock.execute(cwd, { interactionId, host });
            if (json)
                printJson({ ok: true, data: result, warnings: [], interaction: null });
            else
                console.log(`Resolved BLOCK ${result.requestId}`);
            return;
        }
        throw new Error("Usage: continuum block <return-to-design|resolve>");
    }
    if (command === "matt") {
        const action = args[1];
        if (action === "scan") {
            const result = await app.matt.scan.execute(cwd, flag(args, "--change"));
            if (json)
                printJson({ ok: true, data: result, warnings: [], interaction: null });
            else {
                console.log(`Discovered ${result.discovered.length} Matt artifacts`);
                if (result.registered.length)
                    console.log(`Registered: ${result.registered.join(", ")}`);
                if (result.existing.length)
                    console.log(`Existing: ${result.existing.join(", ")}`);
                if (result.linkedToChange.length)
                    console.log(`Linked to change: ${result.linkedToChange.join(", ")}`);
            }
            return;
        }
        throw new Error("Usage: continuum matt scan [--change CHANGE]");
    }
    if (command === "context") {
        const workId = requireArg(args[1], "Usage: continuum context <work>");
        const maxItemsRaw = flag(args, "--max-items"), maxCharsRaw = flag(args, "--max-chars");
        const maxItems = maxItemsRaw ? Number(maxItemsRaw) : undefined, maxTotalChars = maxCharsRaw ? Number(maxCharsRaw) : undefined;
        if (maxItems !== undefined && (!Number.isInteger(maxItems) || maxItems <= 0))
            throw new Error("--max-items must be a positive integer");
        if (maxTotalChars !== undefined && (!Number.isInteger(maxTotalChars) || maxTotalChars <= 0))
            throw new Error("--max-chars must be a positive integer");
        const result = await app.context.route.execute(cwd, workId, { maxItems, maxTotalChars });
        if (json)
            printJson({ ok: true, data: result, warnings: result.warnings, interaction: null });
        else {
            console.log(`Context for ${result.workId}`);
            for (const item of result.required)
                console.log(`${item.priority}  required   ${item.artifactId.padEnd(14)} ${item.reason} · ${item.locator}`);
            for (const item of result.optional)
                console.log(`${item.priority}  optional   ${item.artifactId.padEnd(14)} ${item.reason} · ${item.locator}`);
            if (result.excludedHistorical.length)
                console.log(`Historical excluded: ${result.excludedHistorical.join(", ")}`);
            for (const warning of result.warnings)
                console.log(`WARN ${warning}`);
        }
        return;
    }
    if (command === "reconcile") {
        const changeId = flag(args, "--change");
        if (changeId) {
            const result = await app.reconcile.change.execute(cwd, changeId);
            if (json)
                printJson({ ok: true, data: result, warnings: [], interaction: null });
            else
                console.log(`Continuum · change reconcile · ${result.change.changeId} · snapshot ${result.snapshot.snapshotId} · ${result.status.toLowerCase()}`);
            return;
        }
        const result = await app.reconcile.work.execute(cwd);
        if (json)
            printJson({ ok: true, data: result, warnings: [], interaction: null });
        else if (result.status === "NOOP")
            console.log("Continuum · reconcile · no changes");
        else if (result.status === "DEDUPED")
            console.log(`Continuum · reconcile · deduped · ${result.candidate?.currentRevision ?? ""}`);
        else
            console.log(`Continuum · reconcile · ${result.candidate?.knowledgeImpact} · ${result.candidate?.changedFiles.length ?? 0} files`);
        return;
    }
    if (command === "lifecycle") {
        const action = args[1];
        if (action === "checkpoint") {
            const sessionId = flag(args, "--session"), host = flag(args, "--host");
            if ((sessionId && !host) || (!sessionId && host))
                throw new Error("--session and --host must be provided together");
            const result = await app.lifecycle.checkpoint.execute(cwd, { source: flag(args, "--source") ?? "explicit-cli", ...(sessionId && host ? { sessionId, host } : {}) });
            if (json)
                printJson({ ok: true, data: result, warnings: [], interaction: null });
            else
                console.log(`Continuum · checkpoint · ${result.status.toLowerCase()}`);
            return;
        }
        if (action === "install-git-hook") {
            const result = await app.lifecycle.installGitHook(cwd, flag(args, "--command"));
            if (json)
                printJson({ ok: true, data: result, warnings: [], interaction: null });
            else
                console.log(`${result.updated ? "Installed" : "Found"} ${result.path}`);
            return;
        }
        throw new Error("Usage: continuum lifecycle <checkpoint|install-git-hook>");
    }
    if (command === "host") {
        const hostAction = args[1];
        if (hostAction === "install") {
            const hostName = requireArg(args[2], "Usage: continuum host install <codex|omp>");
            const cliEntry = resolve(fileURLToPath(import.meta.url));
            const packageRoot = resolve(dirname(cliEntry), "../..");
            if (hostName === "codex") {
                const capabilities = await new CodexCapabilityDetector().detect();
                if (!capabilities.installed)
                    throw new ContinuumError("CONTINUUM_HOST_UNAVAILABLE", "Codex executable was not found.", true, { capabilities });
                const mcpServer = join(packageRoot, "runtime-assets", "codex-mcp-server.mjs");
                const result = await new CodexHostInstaller().install(cwd, cliEntry, mcpServer, !has(args, "--skip-mcp"));
                const data = { ...result, capabilities };
                if (json)
                    printJson({ ok: true, data, warnings: result.warnings, interaction: null });
                else {
                    console.log(`Codex hooks: ${result.hooksPath}`);
                    console.log(`Codex MCP: ${result.mcp}`);
                    for (const warning of result.warnings)
                        console.log(`WARN ${warning}`);
                }
                return;
            }
            if (hostName === "omp") {
                const capabilities = await new OmpCapabilityDetector().detect();
                if (!capabilities.installed)
                    throw new ContinuumError("CONTINUUM_HOST_UNAVAILABLE", "OMP executable was not found.", true, { capabilities });
                const extensionAsset = join(packageRoot, "runtime-assets", "omp-extension.ts");
                const result = await new OmpHostInstaller().install(cwd, extensionAsset);
                const data = { ...result, capabilities };
                if (json)
                    printJson({ ok: true, data, warnings: result.warnings, interaction: null });
                else {
                    console.log(`OMP extension: ${result.extensionPath}`);
                    for (const warning of result.warnings)
                        console.log(`WARN ${warning}`);
                }
                return;
            }
            throw new Error(`Unsupported host: ${hostName}`);
        }
        if (hostAction === "doctor") {
            const result = await app.hostDoctor.execute(cwd);
            const warnings = result.filter(item => item.level === "WARN").map(item => item.message);
            if (json)
                printJson({ ok: !result.some(item => item.level === "FAIL"), data: result, warnings, interaction: null });
            else
                for (const item of result)
                    console.log(`${item.level.padEnd(4)} ${item.host}: ${item.message}`);
            return;
        }
        if (hostAction === "codex") {
            const action = args[2];
            if (action === "capabilities") {
                const result = await new CodexCapabilityDetector().detect();
                if (json)
                    printJson({ ok: true, data: result, warnings: result.diagnostics, interaction: null });
                else
                    console.log(JSON.stringify(result, null, 2));
                return;
            }
            if (action === "hook") {
                const raw = await readStdin();
                const payload = (raw.trim() ? JSON.parse(raw) : {});
                const signal = decodeCodexHook(payload, cwd);
                if (!signal) {
                    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
                    return;
                }
                try {
                    const result = await app.host.lifecycle.execute(signal);
                    process.stdout.write(JSON.stringify(encodeCodexHook(payload, result)));
                }
                catch (error) {
                    if (error instanceof ContinuumError && error.code === "CONTINUUM_PROJECT_NOT_FOUND") {
                        process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
                        return;
                    }
                    if (error instanceof ContinuumError) {
                        process.stdout.write(JSON.stringify({ continue: false, decision: "block", reason: `${error.code}: ${error.message}`, hookSpecificOutput: { hookEventName: String(payload.hook_event_name ?? "UserPromptSubmit") } }));
                        return;
                    }
                    throw error;
                }
                return;
            }
            if (action === "interaction") {
                const interactionAction = args[3];
                if (interactionAction === "next") {
                    const rawType = flag(args, "--type");
                    if (rawType && rawType !== "DECISION" && rawType !== "BLOCK")
                        throw new Error("--type must be DECISION or BLOCK");
                    const result = await app.interaction.pending.execute(cwd, rawType);
                    if (json)
                        printJson({ ok: true, data: result, warnings: [], interaction: result });
                    else
                        console.log(result ? JSON.stringify(result, null, 2) : "No pending Continuum interaction.");
                    return;
                }
                if (interactionAction === "resolve") {
                    const interactionId = requireArg(args[4], "Usage: continuum host codex interaction resolve <id>");
                    const rawAction = (flag(args, "--action") ?? "accept");
                    if (!["accept", "cancel", "dismiss", "unavailable", "resolve"].includes(rawAction))
                        throw new Error("Invalid --action");
                    const result = await app.interaction.resolve.execute(cwd, { interactionId, host: "codex", action: rawAction, selectedOption: flag(args, "--option"), sessionId: flag(args, "--session") });
                    if (json)
                        printJson({ ok: true, data: result, warnings: [], interaction: null });
                    else
                        console.log(`Resolved ${result.requestId} · ${result.action}${result.selectedOption ? ` · ${result.selectedOption}` : ""}`);
                    return;
                }
                throw new Error("Usage: continuum host codex interaction <next|resolve>");
            }
            throw new Error("Usage: continuum host codex <capabilities|hook|interaction>");
        }
        if (hostAction === "omp") {
            const action = args[2];
            if (action === "capabilities") {
                const result = await new OmpCapabilityDetector().detect();
                if (json)
                    printJson({ ok: true, data: result, warnings: result.diagnostics, interaction: null });
                else
                    console.log(JSON.stringify(result, null, 2));
                return;
            }
            if (action === "event") {
                const raw = await readStdin();
                const payload = (raw.trim() ? JSON.parse(raw) : {});
                const signal = decodeOmpEvent(payload, cwd);
                if (!signal) {
                    if (json)
                        printJson({ ok: true, data: { state: "SILENT" }, warnings: [], interaction: null });
                    else
                        process.stdout.write(JSON.stringify({ state: "SILENT" }));
                    return;
                }
                try {
                    const result = encodeOmpEvent(await app.host.lifecycle.execute(signal));
                    if (json)
                        printJson({ ok: true, data: result, warnings: [], interaction: result.interaction ?? null });
                    else
                        process.stdout.write(JSON.stringify(result));
                }
                catch (error) {
                    if (error instanceof ContinuumError && error.code === "CONTINUUM_PROJECT_NOT_FOUND") {
                        if (json)
                            printJson({ ok: true, data: { state: "SILENT" }, warnings: [], interaction: null });
                        else
                            process.stdout.write(JSON.stringify({ state: "SILENT" }));
                        return;
                    }
                    throw error;
                }
                return;
            }
            if (action === "interaction") {
                const interactionAction = args[3];
                if (interactionAction === "next") {
                    const rawType = flag(args, "--type");
                    if (rawType && rawType !== "DECISION" && rawType !== "BLOCK")
                        throw new Error("--type must be DECISION or BLOCK");
                    const result = await app.interaction.pending.execute(cwd, rawType);
                    if (json)
                        printJson({ ok: true, data: result, warnings: [], interaction: result });
                    else
                        console.log(result ? JSON.stringify(result, null, 2) : "No pending Continuum interaction.");
                    return;
                }
                if (interactionAction === "resolve") {
                    const interactionId = requireArg(args[4], "Usage: continuum host omp interaction resolve <id>");
                    const rawAction = (flag(args, "--action") ?? "accept");
                    if (!["accept", "cancel", "dismiss", "unavailable", "resolve"].includes(rawAction))
                        throw new Error("Invalid --action");
                    const result = await app.interaction.resolve.execute(cwd, { interactionId, host: "omp", action: rawAction, selectedOption: flag(args, "--option"), sessionId: flag(args, "--session") });
                    if (json)
                        printJson({ ok: true, data: result, warnings: [], interaction: null });
                    else
                        console.log(`Resolved ${result.requestId} · ${result.action}${result.selectedOption ? ` · ${result.selectedOption}` : ""}`);
                    return;
                }
                throw new Error("Usage: continuum host omp interaction <next|resolve>");
            }
            throw new Error("Usage: continuum host omp <capabilities|event|interaction>");
        }
        throw new Error("Usage: continuum host <install|doctor|codex|omp>");
    }
    if (command === "relation") {
        const action = args[1];
        if (action === "add") {
            const from = requireArg(args[2], "relation source is required");
            const rawType = requireArg(args[3], "relation type is required");
            const to = requireArg(args[4], "relation target is required");
            if (!relationTypes.has(rawType))
                throw new Error(`Invalid relation type: ${rawType}`);
            const rawRouting = (flag(args, "--routing") ?? "required");
            if (!relationRouting.has(rawRouting))
                throw new Error(`Invalid relation routing: ${rawRouting}`);
            const result = await app.relation.register.execute(cwd, { from, to, type: rawType, routing: rawRouting });
            if (json)
                printJson({ ok: true, data: result, warnings: [], interaction: null });
            else
                console.log(`${result.created ? "Added" : "Found"} ${result.relation.relationId} · ${from} -[${rawType}]-> ${to}`);
            return;
        }
        if (action === "list") {
            const relations = await app.relation.list.execute(cwd, flag(args, "--for"));
            if (json)
                printJson({ ok: true, data: relations, warnings: [], interaction: null });
            else
                for (const relation of relations)
                    console.log(`${relation.relationId}  ${relation.from} -[${relation.type}/${relation.routing}]-> ${relation.to}`);
            return;
        }
        throw new Error("Usage: continuum relation <add|list>");
    }
    throw new Error(`Unknown command: ${command}`);
}
main().catch(error => {
    if (error instanceof ContinuumError) {
        const interaction = error.details && typeof error.details === "object" && "interaction" in error.details ? error.details.interaction : null;
        const payload = { ok: false, error: { code: error.code, message: error.message, recoverable: error.recoverable, details: error.details ?? null }, interaction };
        if (process.argv.includes("--json"))
            printJson(payload);
        else
            console.error(`${error.code}: ${error.message}`);
        process.exitCode = 2;
    }
    else {
        if (process.argv.includes("--json"))
            printJson({ ok: false, error: { code: "CONTINUUM_INTERNAL", message: error instanceof Error ? error.message : String(error), recoverable: false } });
        else
            console.error(error);
        process.exitCode = 1;
    }
});
//# sourceMappingURL=index.js.map