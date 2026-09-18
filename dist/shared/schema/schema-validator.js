import { createRequire } from "node:module";
import { ContinuumError } from "../errors/continuum-error.js";
const require = createRequire(import.meta.url);
const artifactIdPattern = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$";
const schemas = {
    project: {
        type: "object", additionalProperties: false, required: ["schema_version", "project_id", "name", "created_at", "repository"],
        properties: { schema_version: { const: 1 }, project_id: { type: "string", pattern: "^prj_" }, name: { type: "string", minLength: 1 }, created_at: { type: "string", format: "date-time" }, repository: { type: "object", additionalProperties: false, required: ["identity"], properties: { identity: { type: "string", minLength: 1 } } } },
    },
    current: {
        type: "object", additionalProperties: false, required: ["schema_version", "project_id", "snapshot_id", "updated_at"],
        properties: { schema_version: { const: 1 }, project_id: { type: "string", pattern: "^prj_" }, snapshot_id: { type: "string", pattern: "^snap_" }, updated_at: { type: "string", format: "date-time" } },
    },
    snapshot: {
        type: "object", additionalProperties: false, required: ["schema_version", "snapshot_id", "project_id", "created_at", "baselines", "active_changes", "blockers"],
        properties: { schema_version: { const: 1 }, snapshot_id: { type: "string", pattern: "^snap_" }, project_id: { type: "string", pattern: "^prj_" }, created_at: { type: "string", format: "date-time" }, baselines: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["repository_identity", "revision"], properties: { repository_identity: { type: "string", minLength: 1 }, revision: { type: "string", pattern: "^[0-9a-fA-F]{40,64}$" } } } }, stage: { type: "string" }, active_changes: { type: "array", uniqueItems: true, items: { type: "string" } }, blockers: { type: "array", uniqueItems: true, items: { type: "string" } }, next_gate: { type: "string" }, last_reconcile: { type: "string" } },
    },
    change: {
        type: "object", additionalProperties: false, required: ["schema_version", "change_id", "title", "status", "created_at", "spec_refs", "ticket_refs"],
        properties: { schema_version: { const: 1 }, change_id: { type: "string", pattern: "^chg_" }, title: { type: "string", minLength: 1 }, intent: { type: "string" }, status: { enum: ["active", "closed", "superseded"] }, created_at: { type: "string", format: "date-time" }, closed_at: { type: "string", format: "date-time" }, superseded_by: { type: "string", pattern: "^chg_" }, spec_refs: { type: "array", uniqueItems: true, items: { type: "string", pattern: artifactIdPattern } }, ticket_refs: { type: "array", uniqueItems: true, items: { type: "string", pattern: artifactIdPattern } } },
    },
    artifact: {
        type: "object", additionalProperties: false, required: ["schema_version", "artifact_id", "type", "authority", "locator"],
        properties: { schema_version: { const: 1 }, artifact_id: { type: "string", pattern: artifactIdPattern }, type: { enum: ["context", "adr", "spec", "ticket", "review", "evidence", "document", "other"] }, authority: { type: "string", minLength: 1 }, locator: { type: "string", minLength: 1 }, version: { type: "string" }, title: { type: "string" }, metadata: { type: "object" } },
    },
    relation: {
        type: "object", additionalProperties: false, required: ["schema_version", "relation_id", "from", "to", "type", "routing", "created_at"],
        properties: { schema_version: { const: 1 }, relation_id: { type: "string", pattern: "^rel_" }, from: { type: "string", pattern: artifactIdPattern }, to: { type: "string", pattern: artifactIdPattern }, type: { enum: ["belongs_to", "blocked_by", "governed_by", "domain_context", "evidence", "supersedes"] }, routing: { enum: ["required", "optional", "historical"] }, created_at: { type: "string", format: "date-time" } },
    }, changeReconcile: {
        type: "object", additionalProperties: false,
        required: ["schema_version", "reconcile_id", "project_id", "change_id", "input_snapshot_id", "implementation_revision", "created_at", "implementation_summary", "resolved_work", "unresolved_work", "knowledge_changes", "architecture_decisions", "discovered_work", "result", "block_reasons"],
        properties: {
            schema_version: { const: 1 }, reconcile_id: { type: "string", pattern: "^crec_" }, project_id: { type: "string", pattern: "^prj_" }, change_id: { type: "string", pattern: "^chg_" },
            input_snapshot_id: { type: "string", pattern: "^snap_" }, implementation_revision: { type: "string", pattern: "^[0-9a-fA-F]{40,64}$" }, created_at: { type: "string", format: "date-time" }, implementation_summary: { type: "string" },
            resolved_work: { type: "array", items: { type: "object", additionalProperties: false, required: ["ticket_id", "work_id", "base_revision", "current_revision", "knowledge_impact", "changed_files", "evidence"], properties: { ticket_id: { type: "string", pattern: artifactIdPattern }, work_id: { type: "string", pattern: "^work_" }, base_revision: { type: "string", pattern: "^[0-9a-fA-F]{40,64}$" }, current_revision: { type: "string", pattern: "^[0-9a-fA-F]{40,64}$" }, knowledge_impact: { enum: ["N0", "N1", "N2", "N3", "N4"] }, changed_files: { type: "array", items: { type: "string" } }, evidence: { type: "object" } } } },
            unresolved_work: { type: "array", items: { type: "object", additionalProperties: false, required: ["ticket_id", "reason"], properties: { ticket_id: { type: "string", pattern: artifactIdPattern }, reason: { type: "string" } } } },
            knowledge_changes: { type: "array", items: { type: "object", additionalProperties: false, required: ["ticket_id", "impact", "note"], properties: { ticket_id: { type: "string", pattern: artifactIdPattern }, impact: { enum: ["N0", "N1", "N2", "N3", "N4"] }, note: { type: "string" } } } },
            architecture_decisions: { type: "array", items: { type: "object", additionalProperties: false, required: ["ticket_id", "note"], properties: { ticket_id: { type: "string", pattern: artifactIdPattern }, note: { type: "string" } } } },
            discovered_work: { type: "array", items: { type: "string" } }, result: { enum: ["pass", "blocked"] }, block_reasons: { type: "array", items: { type: "string" } }
        }
    },
};
function isIso(value) { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function assertAllowed(obj, allowed, schema) { const extra = Object.keys(obj).filter(k => !allowed.includes(k)); if (extra.length)
    throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", `${schema} contains unsupported field(s): ${extra.join(", ")}`); }
function assertStringArray(value, name) { if (!Array.isArray(value) || value.some(v => typeof v !== "string") || new Set(value).size !== value.length)
    throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", `${name} must be a unique string array`); }
function validArtifactId(value) { return typeof value === "string" && new RegExp(artifactIdPattern).test(value); }
function fallbackValidate(schema, value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", `${schema} must be an object`);
    const obj = value;
    const def = schemas[schema];
    const required = def.required;
    for (const key of required)
        if (!(key in obj))
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", `${schema} missing required field: ${key}`);
    if (obj.schema_version !== 1) {
        if (typeof obj.schema_version === "number" && obj.schema_version > 1)
            throw new ContinuumError("CONTINUUM_SCHEMA_TOO_NEW", `${schema} schema_version ${obj.schema_version} is newer than supported version 1`);
        throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", `${schema} schema_version must be 1`);
    }
    if (schema === "project") {
        assertAllowed(obj, ["schema_version", "project_id", "name", "created_at", "repository"], schema);
        if (typeof obj.project_id !== "string" || !obj.project_id.startsWith("prj_") || typeof obj.name !== "string" || !obj.name.trim() || !isIso(obj.created_at))
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "project identity/name/timestamp is invalid");
        const repo = obj.repository;
        if (!repo || typeof repo.identity !== "string" || !repo.identity.trim())
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "repository.identity is invalid");
        assertAllowed(repo, ["identity"], "project.repository");
    }
    if (schema === "current") {
        assertAllowed(obj, ["schema_version", "project_id", "snapshot_id", "updated_at"], schema);
        if (typeof obj.project_id !== "string" || !obj.project_id.startsWith("prj_") || typeof obj.snapshot_id !== "string" || !obj.snapshot_id.startsWith("snap_") || !isIso(obj.updated_at))
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "current pointer is invalid");
    }
    if (schema === "snapshot") {
        assertAllowed(obj, ["schema_version", "snapshot_id", "project_id", "created_at", "baselines", "stage", "active_changes", "blockers", "next_gate", "last_reconcile"], schema);
        if (typeof obj.snapshot_id !== "string" || !obj.snapshot_id.startsWith("snap_") || typeof obj.project_id !== "string" || !obj.project_id.startsWith("prj_") || !isIso(obj.created_at))
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "snapshot identity/timestamp is invalid");
        assertStringArray(obj.active_changes, "snapshot.active_changes");
        assertStringArray(obj.blockers, "snapshot.blockers");
        if (!Array.isArray(obj.baselines) || obj.baselines.length < 1)
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "snapshot baselines are invalid");
        for (const item of obj.baselines) {
            if (!item || typeof item !== "object" || Array.isArray(item))
                throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "snapshot repository baseline is invalid");
            const b = item;
            assertAllowed(b, ["repository_identity", "revision"], "snapshot.baseline");
            if (typeof b.repository_identity !== "string" || !b.repository_identity || typeof b.revision !== "string" || !/^[0-9a-f]{40,64}$/i.test(b.revision))
                throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "snapshot repository baseline is invalid");
        }
    }
    if (schema === "change") {
        assertAllowed(obj, ["schema_version", "change_id", "title", "intent", "status", "created_at", "closed_at", "superseded_by", "spec_refs", "ticket_refs"], schema);
        if (typeof obj.change_id !== "string" || !obj.change_id.startsWith("chg_") || typeof obj.title !== "string" || !obj.title.trim() || !["active", "closed", "superseded"].includes(String(obj.status)) || !isIso(obj.created_at))
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "change identity/status/timestamp is invalid");
        assertStringArray(obj.spec_refs, "change.spec_refs");
        assertStringArray(obj.ticket_refs, "change.ticket_refs");
        if (obj.spec_refs.some(v => !validArtifactId(v)) || obj.ticket_refs.some(v => !validArtifactId(v)))
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "change artifact refs are invalid");
        if (obj.status === "closed" && !isIso(obj.closed_at))
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "closed change requires closed_at");
        if (obj.status === "superseded" && (typeof obj.superseded_by !== "string" || !obj.superseded_by.startsWith("chg_")))
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "superseded change requires superseded_by");
    }
    if (schema === "artifact") {
        assertAllowed(obj, ["schema_version", "artifact_id", "type", "authority", "locator", "version", "title", "metadata"], schema);
        if (!validArtifactId(obj.artifact_id) || !["context", "adr", "spec", "ticket", "review", "evidence", "document", "other"].includes(String(obj.type)) || typeof obj.authority !== "string" || !obj.authority.trim() || typeof obj.locator !== "string" || !obj.locator.trim())
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "artifact identity/type/authority/locator is invalid");
    }
    if (schema === "relation") {
        assertAllowed(obj, ["schema_version", "relation_id", "from", "to", "type", "routing", "created_at"], schema);
        if (typeof obj.relation_id !== "string" || !obj.relation_id.startsWith("rel_") || !validArtifactId(obj.from) || !validArtifactId(obj.to) || obj.from === obj.to || !["belongs_to", "blocked_by", "governed_by", "domain_context", "evidence", "supersedes"].includes(String(obj.type)) || !["required", "optional", "historical"].includes(String(obj.routing)) || !isIso(obj.created_at))
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "relation is invalid");
    }
    if (schema === "changeReconcile") {
        assertAllowed(obj, ["schema_version", "reconcile_id", "project_id", "change_id", "input_snapshot_id", "implementation_revision", "created_at", "implementation_summary", "resolved_work", "unresolved_work", "knowledge_changes", "architecture_decisions", "discovered_work", "result", "block_reasons"], schema);
        if (typeof obj.reconcile_id !== "string" || !obj.reconcile_id.startsWith("crec_") || typeof obj.project_id !== "string" || !obj.project_id.startsWith("prj_") || typeof obj.change_id !== "string" || !obj.change_id.startsWith("chg_") || typeof obj.input_snapshot_id !== "string" || !obj.input_snapshot_id.startsWith("snap_") || typeof obj.implementation_revision !== "string" || !/^[0-9a-f]{40,64}$/i.test(obj.implementation_revision) || !isIso(obj.created_at) || !["pass", "blocked"].includes(String(obj.result)))
            throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "change reconcile identity/result is invalid");
        for (const key of ["resolved_work", "unresolved_work", "knowledge_changes", "architecture_decisions", "discovered_work", "block_reasons"])
            if (!Array.isArray(obj[key]))
                throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", `change reconcile ${key} must be an array`);
    }
}
export class SchemaValidator {
    validators = new Map();
    constructor() {
        try {
            const AjvModule = require("ajv");
            const AjvCtor = AjvModule.default ?? AjvModule;
            const ajv = new AjvCtor({ allErrors: true, strict: false });
            try {
                const formatsModule = require("ajv-formats");
                (formatsModule.default ?? formatsModule)(ajv);
            }
            catch { }
            for (const [name, schema] of Object.entries(schemas)) {
                const validate = ajv.compile(schema);
                this.validators.set(name, (value) => { if (!validate(value)) {
                    const tooNew = value?.schema_version > 1;
                    if (tooNew)
                        throw new ContinuumError("CONTINUUM_SCHEMA_TOO_NEW", `${name} schema_version ${value.schema_version} is newer than supported version 1`);
                    throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", `${name} schema validation failed`, false, { errors: validate.errors });
                } });
            }
        }
        catch {
            if (process.env.CONTINUUM_DEV_FALLBACKS !== "1")
                throw new Error("Ajv and ajv-formats are required. Run npm install; fallback validation is development-only.");
        }
    }
    validate(schema, value) { const validator = this.validators.get(schema); if (validator)
        validator(value);
    else
        fallbackValidate(schema, value); }
}
//# sourceMappingURL=schema-validator.js.map