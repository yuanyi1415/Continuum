import type { EvidenceFact } from "../domain/reconcile/work-reconcile.js";
export interface EvidencePort {
    collectTests(workId: string): Promise<EvidenceFact>;
    collectReview(workId: string): Promise<EvidenceFact>;
    verifyCompletion(workId: string): Promise<EvidenceFact>;
}
