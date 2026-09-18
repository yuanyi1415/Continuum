import type { EvidencePort } from "../../ports/evidence.js";

export class UnknownEvidencePort implements EvidencePort {
  async collectTests(_workId: string) { return { status: "UNKNOWN" as const, source: "not-configured" }; }
  async collectReview(_workId: string) { return { status: "UNKNOWN" as const, source: "not-configured" }; }
  async verifyCompletion(_workId: string) { return { status: "UNKNOWN" as const, source: "not-configured" }; }
}
