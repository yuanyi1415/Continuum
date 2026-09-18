export function assertArchiveManifestInvariant(value) {
    if (!value.archiveId.startsWith("archive_"))
        throw new Error("archiveId must start with archive_");
    if (!value.projectId.startsWith("prj_"))
        throw new Error("projectId must start with prj_");
    if (!value.finalSnapshot.startsWith("snap_"))
        throw new Error("finalSnapshot must start with snap_");
    if (!/^[0-9a-f]{40,64}$/i.test(value.repository.revision))
        throw new Error("archive repository revision must be a full Git revision");
    if (!Number.isFinite(Date.parse(value.createdAt)))
        throw new Error("archive createdAt must be ISO-8601");
    if (value.status === "complete" && value.artifacts.some(item => item.status === "missing" || item.status === "external")) {
        throw new Error("complete archive cannot contain missing/external required artifacts");
    }
}
//# sourceMappingURL=archive.js.map