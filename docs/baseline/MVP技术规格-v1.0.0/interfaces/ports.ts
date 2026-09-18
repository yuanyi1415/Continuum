import type {
  ArtifactRef,
  Change,
  InteractionRequest,
  InteractionResult,
  Project,
  Relation,
  Snapshot,
  WorkBinding,
  WorkReconcileCandidate,
} from "./domain.js";

export interface ProjectStorePort {
  loadProject(): Promise<Project>;
  saveProject(project: Project): Promise<void>;

  loadCurrentSnapshot(): Promise<Snapshot>;
  loadSnapshot(snapshotId: string): Promise<Snapshot>;
  saveSnapshot(snapshot: Snapshot): Promise<void>;
  advanceCurrent(expectedSnapshotId: string, newSnapshotId: string): Promise<void>;

  loadChange(changeId: string): Promise<Change>;
  saveChange(change: Change): Promise<void>;

  loadArtifact(artifactId: string): Promise<ArtifactRef>;
  saveArtifact(artifact: ArtifactRef): Promise<void>;
  listArtifacts(): Promise<ArtifactRef[]>;

  saveRelation(relation: Relation): Promise<void>;
  listRelationsFor(artifactId: string): Promise<Relation[]>;

  saveChangeReconcile(changeId: string, reconcile: unknown): Promise<string>;
}

export interface RuntimeStorePort {
  getWorktreeBinding(worktreeId: string): Promise<WorkBinding | null>;
  bindWork(binding: WorkBinding): Promise<void>;
  clearWorktreeBinding(worktreeId: string): Promise<void>;

  bindSession(sessionId: string, worktreeId: string, host: string): Promise<void>;
  suppressSession(sessionId: string, host: string, reason?: string): Promise<void>;
  isSessionSuppressed(sessionId: string, host: string): Promise<boolean>;

  loadPendingReconcile(workId: string): Promise<WorkReconcileCandidate | null>;
  savePendingReconcile(candidate: WorkReconcileCandidate): Promise<void>;
  deletePendingReconcile(workId: string): Promise<void>;

  savePendingInteraction(request: InteractionRequest): Promise<void>;
  loadPendingInteraction(requestId: string): Promise<InteractionRequest | null>;
  resolveInteraction(result: InteractionResult): Promise<void>;

  hasIdempotencyKey(key: string): Promise<boolean>;
  saveIdempotencyKey(key: string, createdAt: string): Promise<void>;
}

export interface GitPort {
  getRepositoryIdentity(): Promise<string>;
  getWorktreeIdentity(): Promise<string>;
  getCurrentRevision(): Promise<string>;
  getChangedFiles(fromRevision: string, toRevision: string): Promise<string[]>;
  getDiff(fromRevision: string, toRevision: string): Promise<string>;
  isDirty(): Promise<boolean>;
}

export interface ResolvedArtifact {
  ref: ArtifactRef;
  version?: string;
  content?: string;
  exists: boolean;
}

export interface ArtifactAuthorityPort {
  resolve(ref: ArtifactRef): Promise<ResolvedArtifact>;
  exists(ref: ArtifactRef): Promise<boolean>;
  getVersion(ref: ArtifactRef): Promise<string | undefined>;
  materialize(ref: ArtifactRef, destinationDir: string): Promise<{ path: string; sha256: string }>;
}

export type EvidenceStatus = "PASS" | "FAIL" | "UNKNOWN";

export interface EvidenceResult {
  status: EvidenceStatus;
  source: string;
  details?: Record<string, unknown>;
}

export interface EvidencePort {
  collectTests(workId: string): Promise<EvidenceResult>;
  collectReview(workId: string): Promise<EvidenceResult>;
  verifyCompletion(workId: string): Promise<EvidenceResult>;
}

export interface HostCapabilities {
  ambientStatus: boolean;
  structuredDecision: boolean;
  blockingUi: boolean;
  lifecycleHooks: boolean;
  headless: boolean;
}

export interface InteractionRenderer {
  capabilities(): Promise<HostCapabilities>;
  renderStatus(request: InteractionRequest): Promise<void>;
  renderNotice(request: InteractionRequest): Promise<void>;
  requestDecision(request: InteractionRequest): Promise<InteractionResult>;
  renderBlock(request: InteractionRequest): Promise<void>;
}

export interface ClockPort {
  nowIso(): string;
}

export interface IdGeneratorPort {
  next(prefix: string): string;
}
