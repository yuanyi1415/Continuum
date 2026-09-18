export class VerifyArchive {
    archive;
    constructor(archive) {
        this.archive = archive;
    }
    execute(archivePath) { return this.archive.verify(archivePath); }
}
//# sourceMappingURL=verify-archive.js.map