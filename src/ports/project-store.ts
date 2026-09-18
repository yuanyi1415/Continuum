import type { ArtifactRef } from "../domain/artifact/artifact-ref.js";
import type { Change } from "../domain/change/change.js";
import type { Relation } from "../domain/relation/relation.js";
import type { Project } from "../domain/project/project.js";
import type { ChangeReconcile } from "../domain/reconcile/change-reconcile.js";
import type { CurrentPointer, Snapshot } from "../domain/snapshot/snapshot.js";

export interface ProjectStorePort {
  exists(): Promise<boolean>;
  initialize(project: Project, snapshot: Snapshot, current: CurrentPointer): Promise<void>;
  loadProject(): Promise<Project>;
  loadCurrent(): Promise<CurrentPointer>;
  loadSnapshot(snapshotId: string): Promise<Snapshot>;
  saveSnapshot(snapshot: Snapshot): Promise<void>;
  advanceCurrent(expectedSnapshotId: string, newSnapshotId: string, updatedAt: string): Promise<void>;

  saveChange(change: Change): Promise<void>;
  loadChange(changeId: string): Promise<Change>;
  listChanges(): Promise<Change[]>;
  hasChange(changeId: string): Promise<boolean>;

  saveArtifact(artifact: ArtifactRef): Promise<void>;
  loadArtifact(artifactId: string): Promise<ArtifactRef>;
  listArtifacts(): Promise<ArtifactRef[]>;
  hasArtifact(artifactId: string): Promise<boolean>;

  saveRelation(relation: Relation): Promise<void>;
  loadRelation(relationId: string): Promise<Relation>;
  listRelations(): Promise<Relation[]>;
  listRelationsFor(nodeId: string): Promise<Relation[]>;

  saveChangeReconcile(reconcile: ChangeReconcile): Promise<void>;
  loadChangeReconcile(reconcileId: string): Promise<ChangeReconcile>;
  hasChangeReconcile(reconcileId: string): Promise<boolean>;

  nodeExists(nodeId: string): Promise<boolean>;
}
