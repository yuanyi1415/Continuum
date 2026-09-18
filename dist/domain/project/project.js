export function assertProjectInvariant(project) {
    if (!project.projectId.startsWith("prj_"))
        throw new Error("projectId must start with prj_");
    if (!project.name.trim())
        throw new Error("project name cannot be empty");
    if (!project.repository.identity.trim())
        throw new Error("repository identity cannot be empty");
}
//# sourceMappingURL=project.js.map