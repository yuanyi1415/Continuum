export type ChangeStatus = "active" | "closed" | "superseded";

export interface Change {
  schemaVersion: 1;
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

export function assertChangeInvariant(change: Change): void {
  if (!change.changeId.startsWith("chg_")) throw new Error("changeId must start with chg_");
  if (!change.title.trim()) throw new Error("change title cannot be empty");
  if (!Number.isFinite(Date.parse(change.createdAt))) throw new Error("change createdAt must be ISO-8601");
  if (change.status === "closed" && !change.closedAt) throw new Error("closed change requires closedAt");
  if (change.status === "superseded" && !change.supersededBy) throw new Error("superseded change requires supersededBy");
  if (change.status === "active" && (change.closedAt || change.supersededBy)) throw new Error("active change cannot have terminal metadata");
  if (new Set(change.specRefs).size !== change.specRefs.length) throw new Error("change specRefs must be unique");
  if (new Set(change.ticketRefs).size !== change.ticketRefs.length) throw new Error("change ticketRefs must be unique");
}

export function assertChangeTransition(from: ChangeStatus, to: ChangeStatus): void {
  if (from === to) return;
  if (from === "active" && (to === "closed" || to === "superseded")) return;
  throw new Error(`invalid change transition: ${from} -> ${to}`);
}

export function attachArtifactRef(change: Change, artifactId: string, artifactType: string): Change {
  if (artifactType !== "spec" && artifactType !== "ticket") return change;
  const field = artifactType === "spec" ? "specRefs" : "ticketRefs";
  const existing = change[field];
  if (existing.includes(artifactId)) return change;
  const updated: Change = { ...change, [field]: [...existing, artifactId] };
  assertChangeInvariant(updated);
  return updated;
}
