export function assertChangeReconcileInvariant(value) {
    if (!value.reconcileId.startsWith("crec_"))
        throw new Error("change reconcile id must start with crec_");
    if (!value.projectId.startsWith("prj_"))
        throw new Error("projectId must start with prj_");
    if (!value.changeId.startsWith("chg_"))
        throw new Error("changeId must start with chg_");
    if (!value.inputSnapshotId.startsWith("snap_"))
        throw new Error("inputSnapshotId must start with snap_");
    if (!/^[0-9a-f]{40,64}$/i.test(value.implementationRevision))
        throw new Error("implementationRevision must be a full Git revision");
    if (!Number.isFinite(Date.parse(value.createdAt)))
        throw new Error("createdAt must be ISO-8601");
    if (value.result === "pass" && (value.unresolvedWork.length || value.blockReasons.length))
        throw new Error("passing change reconcile cannot contain unresolved work or block reasons");
}
//# sourceMappingURL=change-reconcile.js.map