export function assertChangeInvariant(change) {
    if (!change.changeId.startsWith("chg_"))
        throw new Error("changeId must start with chg_");
    if (!change.title.trim())
        throw new Error("change title cannot be empty");
    if (!Number.isFinite(Date.parse(change.createdAt)))
        throw new Error("change createdAt must be ISO-8601");
    if (change.status === "closed" && !change.closedAt)
        throw new Error("closed change requires closedAt");
    if (change.status === "superseded" && !change.supersededBy)
        throw new Error("superseded change requires supersededBy");
    if (change.status === "active" && (change.closedAt || change.supersededBy))
        throw new Error("active change cannot have terminal metadata");
    if (new Set(change.specRefs).size !== change.specRefs.length)
        throw new Error("change specRefs must be unique");
    if (new Set(change.ticketRefs).size !== change.ticketRefs.length)
        throw new Error("change ticketRefs must be unique");
}
export function assertChangeTransition(from, to) {
    if (from === to)
        return;
    if (from === "active" && (to === "closed" || to === "superseded"))
        return;
    throw new Error(`invalid change transition: ${from} -> ${to}`);
}
export function attachArtifactRef(change, artifactId, artifactType) {
    if (artifactType !== "spec" && artifactType !== "ticket")
        return change;
    const field = artifactType === "spec" ? "specRefs" : "ticketRefs";
    const existing = change[field];
    if (existing.includes(artifactId))
        return change;
    const updated = { ...change, [field]: [...existing, artifactId] };
    assertChangeInvariant(updated);
    return updated;
}
//# sourceMappingURL=change.js.map