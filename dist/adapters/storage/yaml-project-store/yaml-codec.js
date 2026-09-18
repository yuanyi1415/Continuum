import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export class YamlCodec {
    yaml;
    constructor() {
        try {
            this.yaml = require("yaml");
        }
        catch {
            if (process.env.CONTINUUM_DEV_FALLBACKS !== "1")
                throw new Error("yaml package is required. Run npm install.");
        }
    }
    stringify(value) {
        if (this.yaml)
            return this.yaml.stringify(value, { indent: 2, lineWidth: 0, aliasDuplicateObjects: false });
        // JSON is a valid YAML 1.2 subset; this path exists only for constrained development tests.
        return JSON.stringify(value, null, 2) + "\n";
    }
    parse(text) { return this.yaml ? this.yaml.parse(text) : JSON.parse(text); }
}
//# sourceMappingURL=yaml-codec.js.map