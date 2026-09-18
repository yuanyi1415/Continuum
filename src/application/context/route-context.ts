import type { ArtifactRef } from "../../domain/artifact/artifact-ref.js";
import type { ContextManifest, ContextManifestItem, ContextPriority } from "../../domain/context/context-manifest.js";
import type { Relation, RelationType } from "../../domain/relation/relation.js";
import type { ArtifactAuthorityPort } from "../../ports/artifact-authority.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";

interface RouteOptions { maxHops?: number; maxItems?: number; maxTotalChars?: number; }
interface Candidate { artifact: ArtifactRef; reason: string; priority: ContextPriority; }

const PRIORITY_ORDER: Record<ContextPriority, number> = { P0:0, P1:1, P2:2, P3:3 };

function reasonFor(type: RelationType, artifact: ArtifactRef): { reason:string; priority:ContextPriority } {
  if (type === "domain_context") return { reason:"required domain context", priority:"P1" };
  if (type === "governed_by") return { reason:"governing ADR", priority:"P2" };
  if (type === "blocked_by") return { reason:"active blocker", priority:"P2" };
  if (type === "evidence") return { reason:"supporting evidence", priority:"P3" };
  if (type === "belongs_to" && artifact.type === "spec") return { reason:"parent spec", priority:"P1" };
  return { reason:`related by ${type}`, priority:"P3" };
}

function itemOf(candidate: Candidate): ContextManifestItem {
  const a = candidate.artifact;
  return { artifactId:a.artifactId, type:a.type, locator:a.locator, ...(a.title?{title:a.title}:{}), ...(a.version?{version:a.version}:{}), reason:candidate.reason, priority:candidate.priority };
}

export class RouteContext {
  constructor(
    private readonly git: GitPort,
    private readonly storeFactory: (root:string)=>ProjectStorePort,
    private readonly authorityFactory: (root:string)=>ArtifactAuthorityPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(cwd: string, workId: string, options: RouteOptions = {}): Promise<ContextManifest> {
    const facts = await this.git.inspect(cwd);
    const store = this.storeFactory(facts.root);
    if (!(await store.hasArtifact(workId))) throw new ContinuumError("CONTINUUM_ARTIFACT_NOT_FOUND", `Context target artifact not found: ${workId}`, true);
    const target = await store.loadArtifact(workId);
    const relations = await store.listRelations();
    const maxHops = options.maxHops ?? 2;
    const maxItems = options.maxItems ?? 50;
    const maxTotalChars = options.maxTotalChars ?? 200_000;

    const required = new Map<string,Candidate>();
    const optional = new Map<string,Candidate>();
    const historical = new Set<string>();
    const visitedDepth = new Map<string,number>();
    const queue: Array<{ id:string; depth:number }> = [{id:target.artifactId,depth:0}];
    required.set(target.artifactId,{artifact:target,reason:"current work",priority:"P0"});

    // Parent Change is not a context artifact, but its declared spec refs are.
    for (const rel of relations.filter(r=>r.from===target.artifactId && r.type==="belongs_to" && r.routing!=="historical")) {
      if (await store.hasChange(rel.to)) {
        const change = await store.loadChange(rel.to);
        for (const specId of change.specRefs) {
          if (await store.hasArtifact(specId)) {
            const artifact = await store.loadArtifact(specId);
            required.set(specId,{artifact,reason:"parent change spec",priority:"P1"});
            queue.push({id:specId,depth:1});
          }
        }
      }
    }

    while (queue.length) {
      const current = queue.shift()!;
      const previous = visitedDepth.get(current.id);
      if (previous !== undefined && previous <= current.depth) continue;
      visitedDepth.set(current.id,current.depth);
      if (current.depth >= maxHops) continue;

      // Relations are directional. Following inbound edges would pull sibling tickets
      // through a shared Spec/Change and inflate context.
      for (const rel of relations.filter(r=>r.from===current.id)) {
        const nextId = rel.to;
        if (await store.hasChange(nextId)) continue;
        if (!(await store.hasArtifact(nextId))) continue;
        const artifact = await store.loadArtifact(nextId);
        if (rel.routing === "historical") { if (!required.has(nextId)) historical.add(nextId); continue; }
        const mapped = reasonFor(rel.type,artifact);
        const candidate = {artifact,reason:mapped.reason,priority:mapped.priority};
        if (rel.routing === "optional") {
          if (!required.has(nextId)) {
            const old = optional.get(nextId);
            if (!old || PRIORITY_ORDER[candidate.priority] < PRIORITY_ORDER[old.priority]) optional.set(nextId,candidate);
          }
          continue;
        }
        historical.delete(nextId); optional.delete(nextId);
        const old = required.get(nextId);
        if (!old || PRIORITY_ORDER[candidate.priority] < PRIORITY_ORDER[old.priority]) required.set(nextId,candidate);
        queue.push({id:nextId,depth:current.depth+1});
      }
    }

    const requiredItems = [...required.values()].sort((a,b)=>PRIORITY_ORDER[a.priority]-PRIORITY_ORDER[b.priority] || a.artifact.artifactId.localeCompare(b.artifact.artifactId));
    const optionalItems = [...optional.values()].sort((a,b)=>PRIORITY_ORDER[a.priority]-PRIORITY_ORDER[b.priority] || a.artifact.artifactId.localeCompare(b.artifact.artifactId));
    const warnings: string[] = [];

    if (requiredItems.length > maxItems) warnings.push(`Required context items (${requiredItems.length}) exceed soft max_items (${maxItems}).`);
    const authority = this.authorityFactory(facts.root);
    let totalChars = 0;
    for (const candidate of requiredItems) {
      const resolved = await authority.resolve(candidate.artifact);
      if (!resolved.exists) warnings.push(`Required artifact is unavailable: ${candidate.artifact.artifactId}`);
      else totalChars += resolved.content?.length ?? 0;
    }
    if (totalChars > maxTotalChars) warnings.push(`Required context size (${totalChars} chars) exceeds soft max_total_chars (${maxTotalChars}).`);

    return {
      workId:target.artifactId,
      generatedAt:this.clock.nowIso(),
      required:requiredItems.map(itemOf),
      optional:optionalItems.map(itemOf),
      excludedHistorical:[...historical].sort(),
      warnings,
    };
  }
}
