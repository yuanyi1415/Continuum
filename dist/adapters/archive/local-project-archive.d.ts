import type { ArchiveCreateRequest, ArchiveCreateResult, ArchivePort, ArchiveVerificationResult } from "../../ports/archive.js";
export declare class LocalProjectArchive implements ArchivePort {
    create(repositoryRoot: string, input: ArchiveCreateRequest): Promise<ArchiveCreateResult>;
    verify(archivePath: string): Promise<ArchiveVerificationResult>;
}
