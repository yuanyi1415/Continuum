export function assertWorkBindingInvariant(binding) {
    if (!binding.workId.startsWith("work_"))
        throw new Error("workId must start with work_");
    if (!binding.worktreeId.trim())
        throw new Error("worktreeId cannot be empty");
    if (!binding.targetArtifactId.trim())
        throw new Error("targetArtifactId cannot be empty");
    if (!/^[0-9a-f]{40,64}$/i.test(binding.workStartRevision))
        throw new Error("workStartRevision must be a full Git revision");
    if (!Number.isFinite(Date.parse(binding.boundAt)))
        throw new Error("boundAt must be ISO-8601");
    if (!binding.bindingSource.trim())
        throw new Error("bindingSource cannot be empty");
}
//# sourceMappingURL=work-binding.js.map