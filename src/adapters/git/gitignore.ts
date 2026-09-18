import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteFile } from "../storage/yaml-project-store/atomic-file.js";
export function ensureContinuumLocalIgnored(repositoryRoot: string): void {
  const path = join(repositoryRoot, ".gitignore");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing.split(/\r?\n/).map(x => x.trim());
  if (lines.includes(".continuum-local/")) return;
  const prefix = existing.length && !existing.endsWith("\n") ? "\n" : "";
  atomicWriteFile(path, `${existing}${prefix}.continuum-local/\n`);
}
