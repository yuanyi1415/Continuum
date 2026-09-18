export type ChangeStatus = "active" | "closed" | "superseded";
export type InteractionType = "STATUS" | "NOTICE" | "DECISION" | "BLOCK";
export type RelationRouting = "required" | "optional" | "historical";
export type RelationType =
  | "belongs_to"
  | "blocked_by"
  | "governed_by"
  | "domain_context"
  | "evidence"
  | "supersedes";
export type KnowledgeImpact = "N0" | "N1" | "N2" | "N3" | "N4";

export interface RepositoryIdentity {
  identity: string;
  revision?: string;
}

export interface Project {
  schemaVersion: number;
  projectId: string;
  name: string;
  createdAt: string;
  repository: RepositoryIdentity;
}

export interface Snapshot {
  schemaVersion: number;
  snapshotId: string;
  projectId: string;
  createdAt: string;
  baselines: RepositoryIdentity[];
  stage?: string;
  activeChanges: string[];
  blockers: string[];
  nextGate?: string;
  lastReconcile?: string;
}

export interface Change {
  schemaVersion: number;
  changeId: string;
  title: string;
  intent?: string;
  status: ChangeStatus;
  createdAt: string;
  closedAt?: string;
  supersededBy?: string;
  specRefs: string[];
  ticketRefs: string[];
}

export interface ArtifactRef {
  schemaVersion: number;
  artifactId: string;
  type: "context" | "adr" | "spec" | "ticket" | "review" | "evidence" | "document" | "other";
  authority: string;
  locator: string;
  version?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface Relation {
  schemaVersion: number;
  relationId: string;
  from: string;
  to: string;
  type: RelationType;
  routing: RelationRouting;
  createdAt: string;
}

export interface WorkBinding {
  workId: string;
  worktreeId: string;
  targetArtifactId: string;
  changeId?: string;
  workStartRevision: string;
  boundAt: string;
  bindingSource: string;
}

export interface WorkReconcileCandidate {
  workId: string;
  baseRevision: string;
  currentRevision: string;
  changedFiles: string[];
  evidence: Record<string, unknown>;
  knowledgeImpact: KnowledgeImpact;
  actions: string[];
  updatedAt: string;
}

export interface InteractionOption {
  id: string;
  label: string;
  description?: string;
}

export interface InteractionRequest {
  id: string;
  type: InteractionType;
  title: string;
  message?: string;
  reason?: string;
  options?: InteractionOption[];
  blocking: boolean;
  createdAt: string;
}

export interface InteractionResult {
  requestId: string;
  action: "accept" | "cancel" | "dismiss" | "unavailable";
  selectedOption?: string;
  host: string;
  resolvedAt: string;
}
