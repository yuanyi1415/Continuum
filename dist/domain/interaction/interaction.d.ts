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
export declare function assertInteractionInvariant(request: InteractionRequest): void;
export interface InteractionResult {
    requestId: string;
    action: "accept" | "cancel" | "dismiss" | "unavailable" | "resolve";
    selectedOption?: string;
    host: string;
    resolvedAt: string;
}
