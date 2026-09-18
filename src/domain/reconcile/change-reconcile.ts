import type { WorkReconcileCandidate, KnowledgeImpact } from "./work-reconcile.js";

export type ChangeReconcileResultStatus = "pass" | "blocked";

export interface ResolvedWorkSummary {
  ticketId: string;
  workId: string;
  baseRevision: string;
  currentRevision: string;
  knowledgeImpact: KnowledgeImpact;
  changedFiles: string[];
  evidence: WorkReconcileCandidate["evidence"];
}

export interface ChangeReconcile {
  schemaVersion: 1;
  reconcileId: string;
  projectId: string;
  changeId: string;
  inputSnapshotId: string;
  implementationRevision: string;
  createdAt: string;
  implementationSummary: string;
  resolvedWork: ResolvedWorkSummary[];
  unresolvedWork: Array<{ ticketId: string; reason: string }>;
  knowledgeChanges: Array<{ ticketId: string; impact: KnowledgeImpact; note: string }>;
  architectureDecisions: Array<{ ticketId: string; note: string }>;
  discoveredWork: string[];
  result: ChangeReconcileResultStatus;
  blockReasons: string[];
}

export function assertChangeReconcileInvariant(value: ChangeReconcile): void {
  if (!value.reconcileId.startsWith("crec_")) throw new Error("change reconcile id must start with crec_");
  if (!value.projectId.startsWith("prj_")) throw new Error("projectId must start with prj_");
  if (!value.changeId.startsWith("chg_")) throw new Error("changeId must start with chg_");
  if (!value.inputSnapshotId.startsWith("snap_")) throw new Error("inputSnapshotId must start with snap_");
  if (!/^[0-9a-f]{40,64}$/i.test(value.implementationRevision)) throw new Error("implementationRevision must be a full Git revision");
  if (!Number.isFinite(Date.parse(value.createdAt))) throw new Error("createdAt must be ISO-8601");
  if (value.result === "pass" && (value.unresolvedWork.length || value.blockReasons.length)) throw new Error("passing change reconcile cannot contain unresolved work or block reasons");
}
