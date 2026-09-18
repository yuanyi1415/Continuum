export type ChangeStatus = "active" | "closed" | "superseded";
export interface Change {
    schemaVersion: 1;
    changeId: string;
    title: string;
    intent?: string;
    status: ChangeStatus;
    createdAt: string;
    closedAt?: string;
    supersededBy?: string;
    specRefs: string[];
    ticketRefs: string[];
}
export declare function assertChangeInvariant(change: Change): void;
export declare function assertChangeTransition(from: ChangeStatus, to: ChangeStatus): void;
export declare function attachArtifactRef(change: Change, artifactId: string, artifactType: string): Change;
