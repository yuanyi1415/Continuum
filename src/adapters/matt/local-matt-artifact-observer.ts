import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { ArtifactType } from "../../domain/artifact/artifact-ref.js";
import type { MattArtifactObserverPort, ObservedMattArtifact } from "../../ports/matt-artifact-observer.js";

interface RootSpec { path: string; type: ArtifactType; }

const ROOTS: RootSpec[] = [
  { path: "docs/adr", type: "adr" },
  { path: "docs/adrs", type: "adr" },
  { path: "adr", type: "adr" },
  { path: "adrs", type: "adr" },
  { path: "docs/specs", type: "spec" },
  { path: "specs", type: "spec" },
  { path: "docs/tickets", type: "ticket" },
  { path: "tickets", type: "ticket" },
];

function walkMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().flatMap(name => {
    const path = join(dir, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return [];
    if (stat.isDirectory()) return walkMarkdown(path);
    return stat.isFile() && /\.md$/i.test(name) ? [path] : [];
  });
}

function firstHeading(text: string): string | undefined {
  const match = text.match(/^#\s+(.+?)\s*$/m);
  return match?.[1]?.trim();
}

function frontmatterId(text: string): string | undefined {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return undefined;
  const normalized = text.replaceAll("\r\n", "\n");
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) return undefined;
  const block = normalized.slice(4, end);
  const match = block.match(/^id:\s*["']?([A-Za-z0-9][A-Za-z0-9._:-]{0,127})["']?\s*$/mi);
  return match?.[1];
}

function inferId(type: ArtifactType, fileName: string, text: string): string | undefined {
  const explicit = frontmatterId(text);
  if (explicit) return explicit;
  const stem = basename(fileName).replace(/\.md$/i, "");
  if (type === "adr") return stem.match(/^(ADR[-_]\d+)/i)?.[1]?.toUpperCase().replace("_", "-");
  if (type === "spec") return stem.match(/^(SPEC[-_]\d+)/i)?.[1]?.toUpperCase().replace("_", "-");
  if (type === "ticket") {
    const p = stem.match(/^(P\d+)/i)?.[1];
    if (p) return p.toUpperCase();
    return stem.match(/^(TICKET[-_]\d+)/i)?.[1]?.toUpperCase().replace("_", "-");
  }
  return undefined;
}

export class LocalMattArtifactObserver implements MattArtifactObserverPort {
  constructor(private readonly repositoryRoot: string) {}

  async observe(): Promise<ObservedMattArtifact[]> {
    const observed: ObservedMattArtifact[] = [];
    const contextPath = join(this.repositoryRoot, "CONTEXT.md");
    if (existsSync(contextPath) && statSync(contextPath).isFile()) {
      const text = readFileSync(contextPath, "utf8");
      observed.push({ artifactId: "CONTEXT", type: "context", locator: "CONTEXT.md", ...(firstHeading(text) ? { title: firstHeading(text) } : {}) });
    }

    for (const root of ROOTS) {
      const absoluteRoot = join(this.repositoryRoot, root.path);
      for (const file of walkMarkdown(absoluteRoot)) {
        const text = readFileSync(file, "utf8");
        const artifactId = inferId(root.type, file, text);
        if (!artifactId) continue;
        const locator = relative(this.repositoryRoot, file).replaceAll("\\", "/");
        const title = firstHeading(text);
        observed.push({ artifactId, type: root.type, locator, ...(title ? { title } : {}) });
      }
    }

    const unique = new Map<string, ObservedMattArtifact>();
    for (const artifact of observed.sort((a,b)=>a.locator.localeCompare(b.locator))) {
      const existing = unique.get(artifact.artifactId);
      if (existing && existing.locator !== artifact.locator) {
        throw new Error(`Matt artifact id conflict: ${artifact.artifactId} is present at both ${existing.locator} and ${artifact.locator}`);
      }
      unique.set(artifact.artifactId, artifact);
    }
    return [...unique.values()];
  }
}
