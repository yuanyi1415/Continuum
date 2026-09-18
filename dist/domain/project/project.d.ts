export interface RepositoryIdentity {
    identity: string;
}
export interface Project {
    schemaVersion: 1;
    projectId: string;
    name: string;
    createdAt: string;
    repository: RepositoryIdentity;
}
export declare function assertProjectInvariant(project: Project): void;
