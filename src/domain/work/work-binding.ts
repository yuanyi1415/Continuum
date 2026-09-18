export interface WorkBinding {
  workId: string;
  worktreeId: string;
  targetArtifactId: string;
  changeId?: string;
  workStartRevision: string;
  boundAt: string;
  bindingSource: string;
}

export interface SessionBinding {
  sessionId: string;
  host: string;
  worktreeId: string;
  boundAt: string;
}

export interface SessionSuppression {
  sessionId: string;
  host: string;
  suppressedAt: string;
  reason?: string;
}

export function assertWorkBindingInvariant(binding: WorkBinding): void {
  if (!binding.workId.startsWith("work_")) throw new Error("workId must start with work_");
  if (!binding.worktreeId.trim()) throw new Error("worktreeId cannot be empty");
  if (!binding.targetArtifactId.trim()) throw new Error("targetArtifactId cannot be empty");
  if (!/^[0-9a-f]{40,64}$/i.test(binding.workStartRevision)) throw new Error("workStartRevision must be a full Git revision");
  if (!Number.isFinite(Date.parse(binding.boundAt))) throw new Error("boundAt must be ISO-8601");
  if (!binding.bindingSource.trim()) throw new Error("bindingSource cannot be empty");
}
