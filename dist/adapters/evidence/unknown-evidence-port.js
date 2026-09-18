export class UnknownEvidencePort {
    async collectTests(_workId) { return { status: "UNKNOWN", source: "not-configured" }; }
    async collectReview(_workId) { return { status: "UNKNOWN", source: "not-configured" }; }
    async verifyCompletion(_workId) { return { status: "UNKNOWN", source: "not-configured" }; }
}
//# sourceMappingURL=unknown-evidence-port.js.map