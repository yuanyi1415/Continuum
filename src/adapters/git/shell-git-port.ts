import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import type { GitPort, GitRepositoryFacts } from "../../ports/git.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";
const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[], allowFailure = false): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
    return stdout.trim();
  } catch (error) {
    if (allowFailure) return null;
    throw new ContinuumError("CONTINUUM_GIT_UNAVAILABLE", `Git command failed: git ${args.join(" ")}`, false, { cause: error instanceof Error ? error.message : String(error) });
  }
}

function worktreeIdentity(path: string): string {
  return `worktree_${createHash("sha256").update(path).digest("hex").slice(0, 24)}`;
}

export class ShellGitPort implements GitPort {
  async inspect(cwd: string): Promise<GitRepositoryFacts> {
    const root = await git(cwd, ["rev-parse", "--show-toplevel"]);
    if (!root) throw new ContinuumError("CONTINUUM_GIT_UNAVAILABLE", "Current directory is not inside a Git repository.");
    const canonicalRoot = await realpath(root);
    const head = await git(canonicalRoot, ["rev-parse", "--verify", "HEAD"], true);
    if (!head) throw new ContinuumError("CONTINUUM_GIT_UNBORN", "Continuum requires at least one Git commit so the initial Project Snapshot has a stable code baseline.", true);
    const rootRevision = (await git(canonicalRoot, ["rev-list", "--max-parents=0", "HEAD"]))?.split(/\s+/)[0];
    if (!rootRevision) throw new ContinuumError("CONTINUUM_GIT_UNAVAILABLE", "Cannot determine Git root revision.");
    const origin = await git(canonicalRoot, ["config", "--get", "remote.origin.url"], true);
    const repositoryIdentity = origin && origin.trim() ? origin.trim() : `git-local:${rootRevision}`;
    return { root: canonicalRoot, repositoryIdentity, currentRevision: head, rootRevision, worktreeIdentity: worktreeIdentity(canonicalRoot) };
  }

  async getChangedFiles(cwd: string, fromRevision: string, toRevision: string): Promise<string[]> {
    const output = await git(cwd, ["diff", "--name-only", "--no-renames", `${fromRevision}..${toRevision}`]);
    return output ? output.split(/\r?\n/).map(v => v.trim()).filter(Boolean) : [];
  }

  async getDiff(cwd: string, fromRevision: string, toRevision: string): Promise<string> {
    return (await git(cwd, ["diff", "--no-ext-diff", "--no-renames", `${fromRevision}..${toRevision}`])) ?? "";
  }

  async getHooksDirectory(cwd: string): Promise<string> {
    const facts = await this.inspect(cwd);
    const value = await git(facts.root, ["rev-parse", "--git-path", "hooks"]);
    if (!value) throw new ContinuumError("CONTINUUM_GIT_UNAVAILABLE", "Cannot determine Git hooks directory.");
    return isAbsolute(value) ? value : resolve(facts.root, value);
  }

  async listWorktreeRoots(cwd: string): Promise<string[]> {
    const facts = await this.inspect(cwd);
    const output = await git(facts.root, ["worktree", "list", "--porcelain"]);
    if (!output) return [facts.root];
    const roots = output.split(/\r?\n/).filter(line => line.startsWith("worktree ")).map(line => line.slice("worktree ".length).trim()).filter(Boolean);
    return [...new Set(roots)];
  }

  async isAncestor(cwd: string, ancestorRevision: string, descendantRevision: string): Promise<boolean> {
    const facts = await this.inspect(cwd);
    try {
      await execFileAsync("git", ["merge-base", "--is-ancestor", ancestorRevision, descendantRevision], { cwd: facts.root, encoding: "utf8" });
      return true;
    } catch (error: any) {
      if (error && typeof error === "object" && "code" in error && error.code === 1) return false;
      throw new ContinuumError("CONTINUUM_GIT_UNAVAILABLE", "Cannot determine Git ancestry.", true, { cause: error instanceof Error ? error.message : String(error) });
    }
  }
}
