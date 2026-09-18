import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export function git(cwd:string, ...args:string[]): string { return execFileSync("git", args, { cwd, encoding:"utf8" }).trim(); }
export function createRepo(root:string, remote?:string): void {
  mkdirSync(root, { recursive:true }); git(root, "init"); git(root, "config", "user.email", "continuum-test@example.com"); git(root, "config", "user.name", "Continuum Test");
  writeFileSync(join(root, "README.md"), "# fixture\n", "utf8"); git(root, "add", "."); git(root, "commit", "-m", "initial");
  if (remote) git(root, "remote", "add", "origin", remote);
}
