import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { ArtifactRef } from "../../domain/artifact/artifact-ref.js";
import type { ArtifactAuthorityPort, ResolvedArtifact } from "../../ports/artifact-authority.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";

const execFileAsync = promisify(execFile);

function normalizePath(root: string, locator: string): { absolute: string; relativePath: string } {
  if (!locator || locator.includes("\0")) throw new ContinuumError("CONTINUUM_ARTIFACT_LOCATOR_INVALID", "Artifact locator is invalid.");
  const absolute = resolve(root, locator);
  const rel = relative(root, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || rel.startsWith("/")) {
    throw new ContinuumError("CONTINUUM_ARTIFACT_LOCATOR_INVALID", `Artifact locator escapes repository root: ${locator}`);
  }
  return { absolute, relativePath: rel.replaceAll("\\", "/") };
}

export class LocalGitArtifactAuthority implements ArtifactAuthorityPort {
  constructor(private readonly repositoryRoot: string) {}

  private assertAuthority(ref: ArtifactRef): void {
    if (ref.authority !== "git-file") {
      throw new ContinuumError("CONTINUUM_AUTHORITY_UNAVAILABLE", `Unsupported artifact authority: ${ref.authority}`, true);
    }
  }

  async exists(ref: ArtifactRef): Promise<boolean> {
    this.assertAuthority(ref);
    const { absolute } = normalizePath(this.repositoryRoot, ref.locator);
    return existsSync(absolute);
  }

  async getVersion(ref: ArtifactRef): Promise<string | undefined> {
    this.assertAuthority(ref);
    const { absolute, relativePath } = normalizePath(this.repositoryRoot, ref.locator);
    if (!existsSync(absolute)) return undefined;
    try {
      const { stdout } = await execFileAsync("git", ["hash-object", "--", relativePath], { cwd: this.repositoryRoot, encoding: "utf8" });
      return stdout.trim() || undefined;
    } catch (error) {
      throw new ContinuumError("CONTINUUM_GIT_UNAVAILABLE", `Cannot hash artifact: ${relativePath}`, true, { cause: error instanceof Error ? error.message : String(error) });
    }
  }

  async getVersionAtRevision(ref: ArtifactRef, revision: string): Promise<string | undefined> {
    this.assertAuthority(ref);
    const { relativePath } = normalizePath(this.repositoryRoot, ref.locator);
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", `${revision}:${relativePath}`], { cwd: this.repositoryRoot, encoding: "utf8" });
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  async resolve(ref: ArtifactRef): Promise<ResolvedArtifact> {
    this.assertAuthority(ref);
    const { absolute } = normalizePath(this.repositoryRoot, ref.locator);
    if (!existsSync(absolute)) return { ref, exists: false };
    let canonical: string;
    try { canonical = realpathSync(absolute); }
    catch { return { ref, exists: false }; }
    const canonicalRoot = realpathSync(this.repositoryRoot);
    const rel = relative(canonicalRoot, canonical);
    if (rel === ".." || rel.startsWith(`..${sep}`) || rel.startsWith("/")) {
      throw new ContinuumError("CONTINUUM_ARTIFACT_LOCATOR_INVALID", `Artifact symlink escapes repository root: ${ref.locator}`);
    }
    const content = readFileSync(canonical, "utf8");
    const version = await this.getVersion(ref);
    return { ref, exists: true, content, version };
  }
}
