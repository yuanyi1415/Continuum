export function actionsForImpact(impact) {
    switch (impact) {
        case "N0": return ["AUTO"];
        case "N1": return ["AUTO"];
        case "N2": return ["PROPOSE"];
        case "N3": return ["PROPOSE"];
        case "N4": return ["STOP"];
    }
}
export function isContinuumInternalPath(path) {
    return path === ".continuum" || path.startsWith(".continuum/") || path === ".continuum-local" || path.startsWith(".continuum-local/");
}
export function classifyKnowledgeImpact(changedFiles) {
    const files = changedFiles.map(path => path.replaceAll("\\", "/").toLowerCase());
    if (files.some(path => /(^|\/)context\.md$/.test(path) || /(^|\/)context\//.test(path)))
        return "N2";
    if (files.some(path => /(^|\/)(adr|adrs)\//.test(path) || /(^|\/)adr[-_]/.test(path)))
        return "N3";
    if (files.some(path => /(^|\/)(spec|specs)\//.test(path) || /(^|\/)[^/]*spec[^/]*\.md$/.test(path)))
        return "N4";
    return "N0";
}
//# sourceMappingURL=work-reconcile.js.map