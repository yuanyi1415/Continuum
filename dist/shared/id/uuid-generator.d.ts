import type { IdGeneratorPort } from "../../ports/id-generator.js";
export declare class UuidGenerator implements IdGeneratorPort {
    next(prefix: string): string;
}
