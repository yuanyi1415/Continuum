import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, basename, join } from "node:path";
export function atomicWriteFile(path, contents) {
    const dir = dirname(path);
    const tmp = join(dir, `.${basename(path)}.tmp-${process.pid}-${Date.now()}`);
    let fd;
    try {
        fd = openSync(tmp, "wx", 0o644);
        writeFileSync(fd, contents, { encoding: "utf8" });
        fsyncSync(fd);
        closeSync(fd);
        fd = undefined;
        renameSync(tmp, path);
        const dirFd = openSync(dir, "r");
        try {
            fsyncSync(dirFd);
        }
        finally {
            closeSync(dirFd);
        }
    }
    catch (error) {
        if (fd !== undefined) {
            try {
                closeSync(fd);
            }
            catch { }
        }
        try {
            unlinkSync(tmp);
        }
        catch { }
        throw error;
    }
}
//# sourceMappingURL=atomic-file.js.map