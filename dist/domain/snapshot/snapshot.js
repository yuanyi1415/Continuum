export function assertSnapshotInvariant(snapshot) {
    if (!snapshot.snapshotId.startsWith("snap_"))
        throw new Error("snapshotId must start with snap_");
    if (snapshot.baselines.length < 1)
        throw new Error("snapshot requires at least one repository baseline");
    for (const baseline of snapshot.baselines) {
        if (!baseline.repositoryIdentity.trim())
            throw new Error("repository baseline identity cannot be empty");
        if (!/^[0-9a-f]{40,64}$/i.test(baseline.revision))
            throw new Error("repository revision must be a full git object id");
    }
}
//# sourceMappingURL=snapshot.js.map