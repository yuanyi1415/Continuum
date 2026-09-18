import { copyFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface OmpGlobalInstallResult {
  scope: "user";
  agentDir: string;
  extensionPath: string;
  extensionInstalled: boolean;
  warnings: string[];
}

export class OmpGlobalInstaller {
  constructor(
    private readonly home: () => string = homedir,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  agentDir(): string {
    return resolve(this.env.PI_CODING_AGENT_DIR?.trim() || join(this.home(), ".omp", "agent"));
  }

  async install(extensionAssetPath: string): Promise<OmpGlobalInstallResult> {
    const agentDir = this.agentDir();
    const extensionPath = join(agentDir, "extensions", "continuum.ts");
    await mkdir(dirname(extensionPath), { recursive: true });
    let extensionInstalled = true;
    try {
      const [existing, asset] = await Promise.all([readFile(extensionPath, "utf8"), readFile(extensionAssetPath, "utf8")]);
      if (existing === asset) extensionInstalled = false;
    } catch {}
    if (extensionInstalled) await copyFile(extensionAssetPath, extensionPath);
    return { scope: "user", agentDir, extensionPath, extensionInstalled, warnings: [] };
  }
}
