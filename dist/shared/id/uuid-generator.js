import { randomUUID } from "node:crypto";
export class UuidGenerator {
    next(prefix) { return `${prefix}_${randomUUID().replaceAll("-", "")}`; }
}
//# sourceMappingURL=uuid-generator.js.map