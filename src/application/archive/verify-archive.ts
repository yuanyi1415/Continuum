import type { ArchivePort, ArchiveVerificationResult } from "../../ports/archive.js";

export class VerifyArchive {
  constructor(private readonly archive: ArchivePort) {}
  execute(archivePath: string): Promise<ArchiveVerificationResult> { return this.archive.verify(archivePath); }
}
