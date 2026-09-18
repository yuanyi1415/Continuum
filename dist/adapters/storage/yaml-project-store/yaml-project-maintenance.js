import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ContinuumError } from "../../../shared/errors/continuum-error.js";
import { SchemaValidator } from "../../../shared/schema/schema-validator.js";
import { atomicWriteFile } from "./atomic-file.js";
import { YamlCodec } from "./yaml-codec.js";
export const DURABLE_SCHEMA_VERSION = 1;
function safeTimestamp(value) { return value.replace(/[:.]/g, "-"); }
function classify(root, path) {
    const rel = relative(root, path).replaceAll("\\", "/");
    if (rel === "project.yaml")
        return "project";
    if (rel === "current.yaml")
        return "current";
    if (/^snapshots\/[^/]+\.yaml$/.test(rel))
        return "snapshot";
    if (/^changes\/change_[^/]+\.yaml$/.test(rel))
        return "change";
    if (/^artifacts\/artifact_[^/]+\.yaml$/.test(rel))
        return "artifact";
    if (/^relations\/rel_[^/]+\.yaml$/.test(rel))
        return "relation";
    if (/^reconciles\/change_[^/]+\.yaml$/.test(rel))
        return "changeReconcile";
    return undefined;
}
function walkYaml(root) {
    const out = [];
    const walk = (dir) => {
        if (!existsSync(dir))
            return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === "archives")
                    continue;
                walk(path);
            }
            else if (entry.isFile() && entry.name.endsWith(".yaml"))
                out.push(path);
        }
    };
    walk(root);
    return out.sort();
}
export class YamlProjectMaintenance {
    repositoryRoot;
    nowIso;
    durableRoot;
    localRoot;
    codec = new YamlCodec();
    validator = new SchemaValidator();
    constructor(repositoryRoot, nowIso) {
        this.repositoryRoot = repositoryRoot;
        this.nowIso = nowIso;
        this.durableRoot = join(repositoryRoot, ".continuum");
        this.localRoot = join(repositoryRoot, ".continuum-local");
    }
    async inspect() {
        const files = [];
        for (const required of ["project.yaml", "current.yaml"]) {
            const path = join(this.durableRoot, required);
            if (!existsSync(path))
                files.push({ path: `.continuum/${required}`, kind: required.replace(".yaml", ""), level: "FAIL", message: `Required durable file is missing: .continuum/${required}` });
        }
        for (const path of walkYaml(this.durableRoot)) {
            const rel = `.continuum/${relative(this.durableRoot, path).replaceAll("\\", "/")}`;
            const schema = classify(this.durableRoot, path);
            if (!schema)
                continue;
            try {
                const doc = this.codec.parse(readFileSync(path, "utf8"));
                const version = doc?.schema_version;
                if (!Number.isInteger(version)) {
                    files.push({ path: rel, kind: schema, level: "FAIL", message: `${rel} has no integer schema_version.` });
                    continue;
                }
                if (version > DURABLE_SCHEMA_VERSION) {
                    files.push({ path: rel, kind: schema, schemaVersion: version, level: "FAIL", message: `${rel} schema_version ${version} is newer than supported ${DURABLE_SCHEMA_VERSION}.` });
                    continue;
                }
                if (version < DURABLE_SCHEMA_VERSION) {
                    files.push({ path: rel, kind: schema, schemaVersion: version, level: "WARN", message: `${rel} schema_version ${version} requires explicit migration to ${DURABLE_SCHEMA_VERSION}.` });
                    continue;
                }
                this.validator.validate(schema, doc);
                files.push({ path: rel, kind: schema, schemaVersion: version, level: "PASS", message: `${rel} schema is valid.` });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                files.push({ path: rel, kind: schema, level: "FAIL", message });
            }
        }
        return {
            currentVersion: DURABLE_SCHEMA_VERSION,
            files,
            hasOlderSchema: files.some(file => file.schemaVersion !== undefined && file.schemaVersion < DURABLE_SCHEMA_VERSION),
            hasTooNewSchema: files.some(file => file.schemaVersion !== undefined && file.schemaVersion > DURABLE_SCHEMA_VERSION),
            hasInvalidSchema: files.some(file => file.level === "FAIL" && !(file.schemaVersion !== undefined && file.schemaVersion > DURABLE_SCHEMA_VERSION)),
        };
    }
    async migrate() {
        const inspection = await this.inspect();
        if (inspection.hasTooNewSchema) {
            const file = inspection.files.find(item => item.schemaVersion !== undefined && item.schemaVersion > DURABLE_SCHEMA_VERSION);
            throw new ContinuumError("CONTINUUM_SCHEMA_TOO_NEW", file.message, false, { path: file.path, schemaVersion: file.schemaVersion, supported: DURABLE_SCHEMA_VERSION });
        }
        if (inspection.hasInvalidSchema) {
            const file = inspection.files.find(item => item.level === "FAIL");
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", file.message, false, { path: file.path });
        }
        const older = inspection.files.filter(file => file.schemaVersion !== undefined && file.schemaVersion < DURABLE_SCHEMA_VERSION);
        if (older.length === 0)
            return { fromVersions: [], toVersion: DURABLE_SCHEMA_VERSION, migratedFiles: [] };
        // P09 only knows the structure-compatible prototype v0 -> v1 migration. Any
        // other legacy version must be explicitly specified by a future migration.
        if (older.some(file => file.schemaVersion !== 0)) {
            const file = older.find(item => item.schemaVersion !== 0);
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", `No durable migration is registered for ${file.path} schema_version ${file.schemaVersion}.`, false, { path: file.path, schemaVersion: file.schemaVersion });
        }
        const backupDirectory = join(this.localRoot, "backups", `durable-schema-${safeTimestamp(this.nowIso())}`);
        mkdirSync(join(this.localRoot, "backups"), { recursive: true });
        cpSync(this.durableRoot, backupDirectory, { recursive: true, errorOnExist: true });
        const migratedFiles = [];
        for (const file of older) {
            const absolute = join(this.repositoryRoot, file.path);
            const schema = classify(this.durableRoot, absolute);
            const doc = this.codec.parse(readFileSync(absolute, "utf8"));
            doc.schema_version = DURABLE_SCHEMA_VERSION;
            this.validator.validate(schema, doc);
            atomicWriteFile(absolute, this.codec.stringify(doc));
            migratedFiles.push(file.path);
        }
        return { fromVersions: [0], toVersion: DURABLE_SCHEMA_VERSION, migratedFiles, backupDirectory };
    }
}
//# sourceMappingURL=yaml-project-maintenance.js.map