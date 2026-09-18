import type { ClockPort } from "../../ports/clock.js";
export declare class SystemClock implements ClockPort {
    nowIso(): string;
}
