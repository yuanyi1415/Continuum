import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const START = "# >>> continuum managed post-commit >>>";
const END = "# <<< continuum managed post-commit <<<";

export class GitHookInstaller {
  async install(hooksDirectory: string, command = "continuum lifecycle checkpoint --source git-post-commit >/dev/null 2>&1 || true"): Promise<{ path: string; updated: boolean }> {
    const path = join(hooksDirectory, "post-commit");
    await mkdir(dirname(path), { recursive: true });
    let current = "";
    try { current = await readFile(path, "utf8"); } catch { current = "#!/bin/sh\n"; }
    if (current.includes(START)) return { path, updated: false };
    if (!current.startsWith("#!")) current = `#!/bin/sh\n${current}`;
    const block = `\n${START}\n${command}\n${END}\n`;
    await writeFile(path, current.replace(/\s*$/, "") + block, "utf8");
    await chmod(path, 0o755);
    return { path, updated: true };
  }
}
