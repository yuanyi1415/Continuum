export type KnowledgeImpact = "N0" | "N1" | "N2" | "N3" | "N4";
export type ReconcileActionClass = "AUTO" | "PROPOSE" | "STOP";
export type EvidenceStatus = "PASS" | "FAIL" | "UNKNOWN";

export interface EvidenceFact {
  status: EvidenceStatus;
  source: string;
  details?: Record<string, unknown>;
}

export interface WorkReconcileEvidence {
  tests: EvidenceFact;
  review: EvidenceFact;
  completion: EvidenceFact;
}

export interface WorkReconcileCandidate {
  workId: string;
  baseRevision: string;
  currentRevision: string;
  changedFiles: string[];
  evidence: WorkReconcileEvidence;
  knowledgeImpact: KnowledgeImpact;
  actions: ReconcileActionClass[];
  updatedAt: string;
}

export function actionsForImpact(impact: KnowledgeImpact): ReconcileActionClass[] {
  switch (impact) {
    case "N0": return ["AUTO"];
    case "N1": return ["AUTO"];
    case "N2": return ["PROPOSE"];
    case "N3": return ["PROPOSE"];
    case "N4": return ["STOP"];
  }
}

export function isContinuumInternalPath(path: string): boolean {
  return path === ".continuum" || path.startsWith(".continuum/") || path === ".continuum-local" || path.startsWith(".continuum-local/");
}

export function classifyKnowledgeImpact(changedFiles: string[]): KnowledgeImpact {
  const files = changedFiles.map(path => path.replaceAll("\\", "/").toLowerCase());
  if (files.some(path => /(^|\/)context\.md$/.test(path) || /(^|\/)context\//.test(path))) return "N2";
  if (files.some(path => /(^|\/)(adr|adrs)\//.test(path) || /(^|\/)adr[-_]/.test(path))) return "N3";
  if (files.some(path => /(^|\/)(spec|specs)\//.test(path) || /(^|\/)[^/]*spec[^/]*\.md$/.test(path))) return "N4";
  return "N0";
}
