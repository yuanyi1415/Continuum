import type { ArchivePort, ArchiveVerificationResult } from "../../ports/archive.js";
export declare class VerifyArchive {
    private readonly archive;
    constructor(archive: ArchivePort);
    execute(archivePath: string): Promise<ArchiveVerificationResult>;
}
