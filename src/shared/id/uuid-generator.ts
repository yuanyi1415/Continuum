import { randomUUID } from "node:crypto";
import type { IdGeneratorPort } from "../../ports/id-generator.js";
export class UuidGenerator implements IdGeneratorPort {
  next(prefix: string): string { return `${prefix}_${randomUUID().replaceAll("-", "")}`; }
}
