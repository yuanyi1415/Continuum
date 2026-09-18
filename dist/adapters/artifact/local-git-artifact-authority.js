import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { ContinuumError } from "../../shared/errors/continuum-error.js";
const execFileAsync = promisify(execFile);
function normalizePath(root, locator) {
    if (!locator || locator.includes("\0"))
        throw new ContinuumError("CONTINUUM_ARTIFACT_LOCATOR_INVALID", "Artifact locator is invalid.");
    const absolute = resolve(root, locator);
    const rel = relative(root, absolute);
    if (rel === ".." || rel.startsWith(`..${sep}`) || rel.startsWith("/")) {
        throw new ContinuumError("CONTINUUM_ARTIFACT_LOCATOR_INVALID", `Artifact locator escapes repository root: ${locator}`);
    }
    return { absolute, relativePath: rel.replaceAll("\\", "/") };
}
export class LocalGitArtifactAuthority {
    repositoryRoot;
    constructor(repositoryRoot) {
        this.repositoryRoot = repositoryRoot;
    }
    assertAuthority(ref) {
        if (ref.authority !== "git-file") {
            throw new ContinuumError("CONTINUUM_AUTHORITY_UNAVAILABLE", `Unsupported artifact authority: ${ref.authority}`, true);
        }
    }
    async exists(ref) {
        this.assertAuthority(ref);
        const { absolute } = normalizePath(this.repositoryRoot, ref.locator);
        return existsSync(absolute);
    }
    async getVersion(ref) {
        this.assertAuthority(ref);
        const { absolute, relativePath } = normalizePath(this.repositoryRoot, ref.locator);
        if (!existsSync(absolute))
            return undefined;
        try {
            const { stdout } = await execFileAsync("git", ["hash-object", "--", relativePath], { cwd: this.repositoryRoot, encoding: "utf8" });
            return stdout.trim() || undefined;
        }
        catch (error) {
            throw new ContinuumError("CONTINUUM_GIT_UNAVAILABLE", `Cannot hash artifact: ${relativePath}`, true, { cause: error instanceof Error ? error.message : String(error) });
        }
    }
    async getVersionAtRevision(ref, revision) {
        this.assertAuthority(ref);
        const { relativePath } = normalizePath(this.repositoryRoot, ref.locator);
        try {
            const { stdout } = await execFileAsync("git", ["rev-parse", `${revision}:${relativePath}`], { cwd: this.repositoryRoot, encoding: "utf8" });
            return stdout.trim() || undefined;
        }
        catch {
            return undefined;
        }
    }
    async resolve(ref) {
        this.assertAuthority(ref);
        const { absolute } = normalizePath(this.repositoryRoot, ref.locator);
        if (!existsSync(absolute))
            return { ref, exists: false };
        let canonical;
        try {
            canonical = realpathSync(absolute);
        }
        catch {
            return { ref, exists: false };
        }
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
//# sourceMappingURL=local-git-artifact-authority.js.map