import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import type { ArtifactRef, ArtifactType } from "../../domain/artifact/artifact-ref.js";
import type { ArchiveArtifactEntry, ArchiveManifest } from "../../domain/archive/archive.js";
import { assertArchiveManifestInvariant } from "../../domain/archive/archive.js";
import type { ArchiveCreateRequest, ArchiveCreateResult, ArchivePort, ArchiveVerificationResult } from "../../ports/archive.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";

const MATERIALIZED_DIR: Partial<Record<ArtifactType, string>> = {
  context: "context",
  adr: "adr",
  spec: "spec",
  ticket: "tickets",
  review: "evidence",
  evidence: "evidence",
};
const COMPLETENESS_TYPES = new Set<ArtifactType>(["context", "adr", "spec", "ticket", "review", "evidence"]);
const CONTINUUM_STATE = ["project.yaml", "current.yaml", "snapshots", "changes", "artifacts", "relations", "reconciles"];

function slash(value: string): string { return value.replaceAll("\\", "/"); }
function sha256(data: Buffer | string): string { return createHash("sha256").update(data).digest("hex"); }
function safeArtifactName(ref: ArtifactRef): string {
  const id = ref.artifactId.replace(/[^A-Za-z0-9._-]/g, "_");
  const suffix = extname(basename(ref.locator)).replace(/[^A-Za-z0-9._-]/g, "_");
  return `${id}${suffix || ".txt"}`;
}
function pathInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !rel.startsWith("/"));
}
function gitBlob(repositoryRoot: string, revision: string, locator: string): Buffer | undefined {
  if (!locator || locator.includes("\0") || locator.startsWith("/")) return undefined;
  const absolute = resolve(repositoryRoot, locator);
  if (!pathInside(repositoryRoot, absolute)) return undefined;
  const rel = slash(relative(repositoryRoot, absolute));
  try {
    return execFileSync("git", ["show", `${revision}:${rel}`], { cwd: repositoryRoot, encoding: "buffer", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }) as Buffer;
  } catch {
    return undefined;
  }
}
function gitBlobId(repositoryRoot: string, revision: string, locator: string): string | undefined {
  if (!locator || locator.includes("\0") || locator.startsWith("/")) return undefined;
  const absolute = resolve(repositoryRoot, locator);
  if (!pathInside(repositoryRoot, absolute)) return undefined;
  const rel = slash(relative(repositoryRoot, absolute));
  try { return execFileSync("git", ["rev-parse", `${revision}:${rel}`], { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined; }
  catch { return undefined; }
}

interface HashEntry { path: string; hash: string; }
function listHashable(root: string, current = root): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const full = join(current, entry.name);
    if (entry.isDirectory()) out.push(...listHashable(root, full));
    else if (entry.isFile() || entry.isSymbolicLink()) out.push(full);
  }
  return out;
}
function hashPath(path: string): string {
  const stat = lstatSync(path);
  return stat.isSymbolicLink() ? sha256(`symlink\0${readlinkSync(path)}`) : sha256(readFileSync(path));
}
function buildChecksums(root: string): HashEntry[] {
  return listHashable(root)
    .filter(path => slash(relative(root, path)) !== "checksums.sha256")
    .map(path => ({ path: slash(relative(root, path)), hash: hashPath(path) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
function writeChecksums(root: string): HashEntry[] {
  const entries = buildChecksums(root);
  writeFileSync(join(root, "checksums.sha256"), entries.map(item => `${item.hash}  ${item.path}`).join("\n") + "\n", "utf8");
  return entries;
}

function manifestDoc(manifest: ArchiveManifest): Record<string, unknown> {
  return {
    schema_version: manifest.schemaVersion,
    archive_id: manifest.archiveId,
    status: manifest.status,
    project: { id: manifest.projectId, name: manifest.projectName, created_at: manifest.projectCreatedAt },
    created_at: manifest.createdAt,
    final_snapshot: manifest.finalSnapshot,
    repository: { identity: manifest.repository.identity, revision: manifest.repository.revision },
    changes: manifest.changes.map(change => ({
      change_id: change.changeId,
      title: change.title,
      status: change.status,
      created_at: change.createdAt,
      ...(change.closedAt ? { closed_at: change.closedAt } : {}),
      ...(change.supersededBy ? { superseded_by: change.supersededBy } : {}),
    })),
    artifacts: manifest.artifacts.map(item => ({
      artifact_id: item.artifactId,
      type: item.type,
      original_ref: {
        authority: item.authority,
        locator: item.locator,
        ...(item.registeredVersion ? { version: item.registeredVersion } : {}),
      },
      ...(item.finalVersion ? { final_version: item.finalVersion } : {}),
      ...(item.materializedPath ? { materialized_path: item.materializedPath } : {}),
      ...(item.sha256 ? { sha256: item.sha256 } : {}),
      status: item.status,
    })),
    missing_or_external: manifest.missingOrExternal,
    continuum: { path: manifest.continuumPath },
    source: {
      snapshot: manifest.sourceSnapshotPath,
      ...(manifest.historyBundlePath ? { history_bundle: manifest.historyBundlePath } : {}),
    },
    checksums: manifest.checksumsPath,
  };
}

function manifestFromDoc(doc: any): ArchiveManifest | undefined {
  if (!doc || typeof doc !== "object" || doc.schema_version !== 1 || typeof doc.archive_id !== "string") return undefined;
  try {
    return {
      schemaVersion: 1,
      archiveId: doc.archive_id,
      status: doc.status,
      projectId: doc.project.id,
      projectName: doc.project.name,
      projectCreatedAt: doc.project.created_at,
      createdAt: doc.created_at,
      finalSnapshot: doc.final_snapshot,
      repository: { identity: doc.repository.identity, revision: doc.repository.revision },
      changes: Array.isArray(doc.changes) ? doc.changes.map((change: any) => ({
        changeId: change.change_id,
        title: change.title,
        status: change.status,
        createdAt: change.created_at,
        ...(change.closed_at ? { closedAt: change.closed_at } : {}),
        ...(change.superseded_by ? { supersededBy: change.superseded_by } : {}),
      })) : [],
      artifacts: Array.isArray(doc.artifacts) ? doc.artifacts.map((item: any) => ({
        artifactId: item.artifact_id,
        type: item.type,
        authority: item.original_ref?.authority,
        locator: item.original_ref?.locator,
        ...(item.original_ref?.version ? { registeredVersion: item.original_ref.version } : {}),
        ...(item.final_version ? { finalVersion: item.final_version } : {}),
        ...(item.materialized_path ? { materializedPath: item.materialized_path } : {}),
        ...(item.sha256 ? { sha256: item.sha256 } : {}),
        status: item.status,
      })) : [],
      missingOrExternal: Array.isArray(doc.missing_or_external) ? doc.missing_or_external : [],
      continuumPath: doc.continuum?.path,
      sourceSnapshotPath: doc.source?.snapshot,
      ...(doc.source?.history_bundle ? { historyBundlePath: doc.source.history_bundle } : {}),
      checksumsPath: doc.checksums,
    };
  } catch { return undefined; }
}

export class LocalProjectArchive implements ArchivePort {
  async create(repositoryRoot: string, input: ArchiveCreateRequest): Promise<ArchiveCreateResult> {
    const archiveRoot = join(repositoryRoot, ".continuum", "archives");
    const target = join(archiveRoot, input.archiveId);
    if (existsSync(target)) throw new ContinuumError("CONTINUUM_ARCHIVE_EXISTS", `Archive already exists: ${input.archiveId}`, false);
    mkdirSync(archiveRoot, { recursive: true });

    const stagingParent = join(repositoryRoot, ".continuum-local", "archive-staging");
    mkdirSync(stagingParent, { recursive: true });
    const staging = join(stagingParent, `${input.archiveId}-${process.pid}-${Date.now()}`);
    mkdirSync(staging, { recursive: true });

    try {
      const continuumTarget = join(staging, "continuum");
      mkdirSync(continuumTarget, { recursive: true });
      for (const name of CONTINUUM_STATE) {
        const source = join(repositoryRoot, ".continuum", name);
        if (!existsSync(source)) continue;
        cpSync(source, join(continuumTarget, name), { recursive: true, dereference: false, errorOnExist: false });
      }

      const artifactEntries: ArchiveArtifactEntry[] = [];
      for (const ref of [...input.artifacts].sort((a, b) => a.artifactId.localeCompare(b.artifactId))) {
        const category = MATERIALIZED_DIR[ref.type];
        if (!category) {
          artifactEntries.push({ artifactId: ref.artifactId, type: ref.type, authority: ref.authority, locator: ref.locator, ...(ref.version ? { registeredVersion: ref.version } : {}), status: "unsupported" });
          continue;
        }
        if (ref.authority !== "git-file") {
          artifactEntries.push({ artifactId: ref.artifactId, type: ref.type, authority: ref.authority, locator: ref.locator, ...(ref.version ? { registeredVersion: ref.version } : {}), status: "external" });
          continue;
        }
        const content = gitBlob(repositoryRoot, input.finalRevision, ref.locator);
        const finalVersion = gitBlobId(repositoryRoot, input.finalRevision, ref.locator);
        if (!content || !finalVersion) {
          artifactEntries.push({ artifactId: ref.artifactId, type: ref.type, authority: ref.authority, locator: ref.locator, ...(ref.version ? { registeredVersion: ref.version } : {}), status: "missing" });
          continue;
        }
        const targetDir = join(staging, "artifacts", category);
        mkdirSync(targetDir, { recursive: true });
        const artifactPath = join(targetDir, safeArtifactName(ref));
        writeFileSync(artifactPath, content);
        artifactEntries.push({
          artifactId: ref.artifactId,
          type: ref.type,
          authority: ref.authority,
          locator: ref.locator,
          ...(ref.version ? { registeredVersion: ref.version } : {}),
          finalVersion,
          materializedPath: slash(relative(staging, artifactPath)),
          sha256: sha256(content),
          status: "materialized",
        });
      }

      const requiredFailures = artifactEntries.filter(item => COMPLETENESS_TYPES.has(item.type) && item.status !== "materialized");
      if (requiredFailures.length && !input.allowIncomplete) {
        throw new ContinuumError(
          "CONTINUUM_ARCHIVE_INCOMPLETE",
          "Archive cannot be self-contained because required artifacts could not be materialized. Re-run with --allow-incomplete to preserve an incomplete archive explicitly.",
          true,
          { artifacts: requiredFailures.map(item => ({ artifactId: item.artifactId, status: item.status, locator: item.locator })) },
        );
      }

      const sourceDir = join(staging, "source", "snapshot");
      mkdirSync(sourceDir, { recursive: true });
      const tarPath = join(staging, "source", ".snapshot.tar");
      try {
        execFileSync("git", ["archive", "--format=tar", "-o", tarPath, input.finalRevision], { cwd: repositoryRoot, stdio: "pipe" });
        execFileSync("tar", ["-xf", tarPath, "-C", sourceDir], { cwd: repositoryRoot, stdio: "pipe" });
      } catch (error) {
        throw new ContinuumError("CONTINUUM_ARCHIVE_SOURCE_FAILED", "Cannot materialize final source snapshot.", false, { cause: error instanceof Error ? error.message : String(error) });
      } finally {
        try { unlinkSync(tarPath); } catch {}
      }

      let historyBundlePath: string | undefined;
      if (input.withHistory) {
        const bundle = join(staging, "source", "history.bundle");
        try { execFileSync("git", ["bundle", "create", bundle, "--all"], { cwd: repositoryRoot, stdio: "pipe" }); }
        catch (error) { throw new ContinuumError("CONTINUUM_ARCHIVE_HISTORY_FAILED", "Cannot create Git history bundle.", false, { cause: error instanceof Error ? error.message : String(error) }); }
        historyBundlePath = "source/history.bundle";
      }

      const status = requiredFailures.length ? "incomplete" : "complete";
      const manifest: ArchiveManifest = {
        schemaVersion: 1,
        archiveId: input.archiveId,
        status,
        projectId: input.project.projectId,
        projectName: input.project.name,
        projectCreatedAt: input.project.createdAt,
        createdAt: input.createdAt,
        finalSnapshot: input.finalSnapshot.snapshotId,
        repository: { identity: input.project.repository.identity, revision: input.finalRevision },
        changes: input.changes.map(change => ({
          changeId: change.changeId,
          title: change.title,
          status: change.status as "closed" | "superseded",
          createdAt: change.createdAt,
          ...(change.closedAt ? { closedAt: change.closedAt } : {}),
          ...(change.supersededBy ? { supersededBy: change.supersededBy } : {}),
        })).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.changeId.localeCompare(b.changeId)),
        artifacts: artifactEntries,
        missingOrExternal: artifactEntries.filter(item => item.status !== "materialized").map(item => item.artifactId),
        continuumPath: "continuum",
        sourceSnapshotPath: "source/snapshot",
        ...(historyBundlePath ? { historyBundlePath } : {}),
        checksumsPath: "checksums.sha256",
      };
      assertArchiveManifestInvariant(manifest);
      writeFileSync(join(staging, "manifest.yaml"), YAML.stringify(manifestDoc(manifest), { indent: 2, lineWidth: 0, aliasDuplicateObjects: false }), "utf8");
      const checksums = writeChecksums(staging);
      const verification = await this.verify(staging);
      if (!verification.ok) throw new ContinuumError("CONTINUUM_ARCHIVE_VERIFY_FAILED", "Newly created archive failed its own integrity verification.", false, { failures: verification.failures });

      renameSync(staging, target);
      return { archivePath: target, manifest, verified: true, checkedFiles: checksums.length };
    } catch (error) {
      rmSync(staging, { recursive: true, force: true });
      throw error;
    }
  }

  async verify(archivePath: string): Promise<ArchiveVerificationResult> {
    const root = resolve(archivePath);
    const failures: string[] = [];
    if (!existsSync(root) || !lstatSync(root).isDirectory()) return { ok: false, archivePath: root, checkedFiles: 0, failures: ["Archive directory does not exist."] };

    let manifest: ArchiveManifest | undefined;
    const manifestPath = join(root, "manifest.yaml");
    if (!existsSync(manifestPath)) failures.push("manifest.yaml is missing.");
    else {
      try {
        const doc = YAML.parse(readFileSync(manifestPath, "utf8"));
        manifest = manifestFromDoc(doc);
        if (!manifest) failures.push("manifest.yaml is invalid or unsupported.");
        else {
          try { assertArchiveManifestInvariant(manifest); } catch (error) { failures.push(`manifest invariant failed: ${error instanceof Error ? error.message : String(error)}`); }
        }
      } catch (error) { failures.push(`manifest.yaml cannot be parsed: ${error instanceof Error ? error.message : String(error)}`); }
    }

    const checksumsPath = join(root, "checksums.sha256");
    if (!existsSync(checksumsPath)) return { ok: false, archivePath: root, archiveId: manifest?.archiveId, status: manifest?.status, checkedFiles: 0, failures: [...failures, "checksums.sha256 is missing."] };

    const lines = readFileSync(checksumsPath, "utf8").split(/\r?\n/).filter(Boolean);
    const expected = new Map<string, string>();
    for (const line of lines) {
      const match = line.match(/^([0-9a-f]{64})  (.+)$/i);
      if (!match) { failures.push(`Invalid checksum line: ${line}`); continue; }
      expected.set(match[2], match[1].toLowerCase());
    }

    let checked = 0;
    for (const [relPath, hash] of expected) {
      const full = resolve(root, relPath);
      if (!pathInside(root, full)) { failures.push(`Checksum path escapes archive: ${relPath}`); continue; }
      if (!existsSync(full)) { failures.push(`Missing archived file: ${relPath}`); continue; }
      try {
        const actual = hashPath(full);
        if (actual !== hash) failures.push(`Checksum mismatch: ${relPath}`);
        checked += 1;
      } catch (error) { failures.push(`Cannot verify ${relPath}: ${error instanceof Error ? error.message : String(error)}`); }
    }

    const actualFiles = new Set(listHashable(root).map(path => slash(relative(root, path))).filter(path => path !== "checksums.sha256"));
    for (const file of actualFiles) if (!expected.has(file)) failures.push(`Unlisted archived file: ${file}`);
    for (const file of expected.keys()) if (!actualFiles.has(file)) failures.push(`Checksum references missing file: ${file}`);

    return { ok: failures.length === 0, archivePath: root, ...(manifest ? { archiveId: manifest.archiveId, status: manifest.status } : {}), checkedFiles: checked, failures };
  }
}
