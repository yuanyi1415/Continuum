import { copyFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
export class OmpGlobalInstaller {
    home;
    env;
    constructor(home = homedir, env = process.env) {
        this.home = home;
        this.env = env;
    }
    agentDir() {
        return resolve(this.env.PI_CODING_AGENT_DIR?.trim() || join(this.home(), ".omp", "agent"));
    }
    async install(extensionAssetPath) {
        const agentDir = this.agentDir();
        const extensionPath = join(agentDir, "extensions", "continuum.ts");
        await mkdir(dirname(extensionPath), { recursive: true });
        let extensionInstalled = true;
        try {
            const [existing, asset] = await Promise.all([readFile(extensionPath, "utf8"), readFile(extensionAssetPath, "utf8")]);
            if (existing === asset)
                extensionInstalled = false;
        }
        catch { }
        if (extensionInstalled)
            await copyFile(extensionAssetPath, extensionPath);
        return { scope: "user", agentDir, extensionPath, extensionInstalled, warnings: [] };
    }
}
//# sourceMappingURL=omp-global-installer.js.map