import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function findContinuumProjectRoot(startPath: string): string | null {
  let current = resolve(startPath || process.cwd());
  try { current = realpathSync(current); } catch {}
  while (true) {
    if (existsSync(join(current, ".continuum", "project.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function hasLegacyCodexProjectAdapter(projectRoot: string): boolean {
  const path = join(projectRoot, ".codex", "hooks.json");
  if (!existsSync(path)) return false;
  try {
    const text = readFileSync(path, "utf8");
    return /continuum/i.test(text) && /host[^\n]*codex[^\n]*hook/i.test(text);
  } catch { return false; }
}

export function hasLegacyOmpProjectAdapter(projectRoot: string): boolean {
  return existsSync(join(projectRoot, ".omp", "extensions", "continuum.ts"));
}
