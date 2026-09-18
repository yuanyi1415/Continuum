export function printJson(data: unknown): void { process.stdout.write(JSON.stringify(data, null, 2) + "\n"); }
export function printStatus(status: any): void {
  console.log(`Continuum · ${status.project.name}`);
  console.log(`Project:  ${status.project.projectId}`);
  console.log(`Snapshot: ${status.current.snapshotId}`);
  console.log(`Baseline: ${status.current.revision}`);
  console.log(`Git HEAD: ${status.git.head}${status.git.baselineMatchesHead ? " (baseline)" : ""}`);
  console.log(`Runtime:  ${status.runtime.available ? `available (${status.runtime.driver})` : "not present"}`);
  if (status.work?.binding) console.log(`Work:     ${status.work.binding.targetArtifactId} (${status.work.binding.workId})`);
  if (status.changes?.active?.length) {
    console.log("Active changes:");
    for (const change of status.changes.active) console.log(`  ${change.changeId}  ${change.title}`);
  }
}
