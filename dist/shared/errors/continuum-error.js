export class ContinuumError extends Error {
    code;
    recoverable;
    details;
    constructor(code, message, recoverable = false, details) {
        super(message);
        this.code = code;
        this.recoverable = recoverable;
        this.details = details;
        this.name = "ContinuumError";
    }
}
//# sourceMappingURL=continuum-error.js.map