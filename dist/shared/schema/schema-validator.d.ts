export type SchemaName = "project" | "current" | "snapshot" | "change" | "artifact" | "relation" | "changeReconcile";
export declare class SchemaValidator {
    private validators;
    constructor();
    validate(schema: SchemaName, value: unknown): void;
}
