import { ListArtifacts } from "../application/artifact/list-artifacts.js";
import { RegisterArtifact } from "../application/artifact/register-artifact.js";
import { GetChange } from "../application/change/get-change.js";
import { ListChanges } from "../application/change/list-changes.js";
import { OpenChange } from "../application/change/open-change.js";
import { RouteContext } from "../application/context/route-context.js";
import { ScanMattArtifacts } from "../application/matt/scan-matt-artifacts.js";
import { LifecycleCheckpoint } from "../application/lifecycle/checkpoint.js";
import { GetPendingInteraction } from "../application/interaction/get-pending-interaction.js";
import { ResolveInteraction } from "../application/interaction/resolve-interaction.js";
import { ReturnToDesign } from "../application/interaction/return-to-design.js";
import { ResolveBlock } from "../application/interaction/resolve-block.js";
import { HandleHostLifecycle } from "../application/host/host-lifecycle.js";
import { ReconcileWork } from "../application/reconcile/reconcile-work.js";
import { ReconcileChange } from "../application/reconcile/reconcile-change.js";
import { Doctor } from "../application/project/doctor.js";
import { MigrateProject } from "../application/project/migrate-project.js";
import { HostDoctor } from "../application/project/host-doctor.js";
import { GetStatus } from "../application/project/get-status.js";
import { InitProject } from "../application/project/init-project.js";
import { ListRelations } from "../application/relation/list-relations.js";
import { RegisterRelation } from "../application/relation/register-relation.js";
import { BindWork } from "../application/work/bind-work.js";
import { GetCurrentWork } from "../application/work/get-current-work.js";
import { SuppressSession } from "../application/work/suppress-session.js";
import { ArchiveProject } from "../application/archive/archive-project.js";
import { VerifyArchive } from "../application/archive/verify-archive.js";
export declare function createApp(): {
    init: InitProject;
    status: GetStatus;
    doctor: Doctor;
    migrate: MigrateProject;
    hostDoctor: HostDoctor;
    archive: {
        create: ArchiveProject;
        verify: VerifyArchive;
    };
    change: {
        open: OpenChange;
        list: ListChanges;
        get: GetChange;
    };
    artifact: {
        register: RegisterArtifact;
        list: ListArtifacts;
    };
    relation: {
        register: RegisterRelation;
        list: ListRelations;
    };
    work: {
        bind: BindWork;
        current: GetCurrentWork;
        suppressSession: SuppressSession;
    };
    matt: {
        scan: ScanMattArtifacts;
    };
    context: {
        route: RouteContext;
    };
    reconcile: {
        work: ReconcileWork;
        change: ReconcileChange;
    };
    interaction: {
        pending: GetPendingInteraction;
        resolve: ResolveInteraction;
        returnToDesign: ReturnToDesign;
        resolveBlock: ResolveBlock;
    };
    host: {
        lifecycle: HandleHostLifecycle;
    };
    lifecycle: {
        checkpoint: LifecycleCheckpoint;
        installGitHook: (cwd: string, command?: string) => Promise<{
            path: string;
            updated: boolean;
        }>;
    };
};
