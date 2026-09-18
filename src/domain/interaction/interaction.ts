export type InteractionType = "STATUS" | "NOTICE" | "DECISION" | "BLOCK";

export interface InteractionOption {
  id: string;
  label: string;
  description?: string;
}

export interface InteractionRequest {
  id: string;
  type: InteractionType;
  title: string;
  message?: string;
  reason?: string;
  options?: InteractionOption[];
  context?: Record<string, unknown>;
  blocking: boolean;
  createdAt: string;
}

export function assertInteractionInvariant(request: InteractionRequest): void {
  if (!request.id.startsWith("int_")) throw new Error("interaction id must start with int_");
  if (!request.title.trim()) throw new Error("interaction title cannot be empty");
  if (!Number.isFinite(Date.parse(request.createdAt))) throw new Error("interaction createdAt must be ISO-8601");
  if (request.type === "BLOCK" && !request.blocking) throw new Error("BLOCK interaction must be blocking");
  if (request.type === "DECISION" && (!request.options || request.options.length < 1)) throw new Error("DECISION interaction requires options");
}

export interface InteractionResult {
  requestId: string;
  action: "accept" | "cancel" | "dismiss" | "unavailable" | "resolve";
  selectedOption?: string;
  host: string;
  resolvedAt: string;
}
