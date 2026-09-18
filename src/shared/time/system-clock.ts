import type { ClockPort } from "../../ports/clock.js";
export class SystemClock implements ClockPort { nowIso(): string { return new Date().toISOString(); } }
