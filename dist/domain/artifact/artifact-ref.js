const ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export function assertArtifactRefInvariant(artifact) {
    if (!ARTIFACT_ID.test(artifact.artifactId))
        throw new Error("artifactId contains unsupported characters");
    if (!artifact.authority.trim())
        throw new Error("artifact authority cannot be empty");
    if (!artifact.locator.trim())
        throw new Error("artifact locator cannot be empty");
    if (artifact.locator.includes("\0"))
        throw new Error("artifact locator contains NUL");
}
//# sourceMappingURL=artifact-ref.js.map