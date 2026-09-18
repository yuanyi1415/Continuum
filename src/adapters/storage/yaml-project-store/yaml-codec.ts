import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

type YamlApi = { stringify(value: unknown, options?: unknown): string; parse(text: string): unknown };

export class YamlCodec {
  private readonly yaml?: YamlApi;
  constructor() {
    try { this.yaml = require("yaml") as YamlApi; }
    catch {
      if (process.env.CONTINUUM_DEV_FALLBACKS !== "1") throw new Error("yaml package is required. Run npm install.");
    }
  }
  stringify(value: unknown): string {
    if (this.yaml) return this.yaml.stringify(value, { indent: 2, lineWidth: 0, aliasDuplicateObjects: false });
    // JSON is a valid YAML 1.2 subset; this path exists only for constrained development tests.
    return JSON.stringify(value, null, 2) + "\n";
  }
  parse(text: string): unknown { return this.yaml ? this.yaml.parse(text) : JSON.parse(text); }
}
