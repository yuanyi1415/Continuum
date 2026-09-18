export function assertRelationInvariant(relation) {
    if (!relation.relationId.startsWith("rel_"))
        throw new Error("relationId must start with rel_");
    if (!relation.from.trim() || !relation.to.trim())
        throw new Error("relation endpoints cannot be empty");
    if (relation.from === relation.to)
        throw new Error("relation cannot point to itself");
    if (!Number.isFinite(Date.parse(relation.createdAt)))
        throw new Error("relation createdAt must be ISO-8601");
}
//# sourceMappingURL=relation.js.map