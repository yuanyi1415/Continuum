import type { EvidencePort } from "../../ports/evidence.js";
export declare class UnknownEvidencePort implements EvidencePort {
    collectTests(_workId: string): Promise<{
        status: "UNKNOWN";
        source: string;
    }>;
    collectReview(_workId: string): Promise<{
        status: "UNKNOWN";
        source: string;
    }>;
    verifyCompletion(_workId: string): Promise<{
        status: "UNKNOWN";
        source: string;
    }>;
}
