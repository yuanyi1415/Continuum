import { LocalGitArtifactAuthority } from "../adapters/artifact/local-git-artifact-authority.js";
import { UnknownEvidencePort } from "../adapters/evidence/unknown-evidence-port.js";
import { GitHookInstaller } from "../adapters/git/git-hook-installer.js";
import { ShellGitPort } from "../adapters/git/shell-git-port.js";
import { RepositoryFilesAdapter } from "../adapters/git/repository-files-adapter.js";
import { LocalMattArtifactObserver } from "../adapters/matt/local-matt-artifact-observer.js";
import { SqliteRuntimeStore } from "../adapters/storage/sqlite-runtime-store/sqlite-runtime-store.js";
import { YamlProjectStore } from "../adapters/storage/yaml-project-store/yaml-project-store.js";
import { YamlProjectMaintenance } from "../adapters/storage/yaml-project-store/yaml-project-maintenance.js";
import { RepositoryHostDiagnostics } from "../adapters/hosts/repository-host-diagnostics.js";
import { LocalProjectArchive } from "../adapters/archive/local-project-archive.js";
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
import { UuidGenerator } from "../shared/id/uuid-generator.js";
import { SystemClock } from "../shared/time/system-clock.js";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function createApp() {
  const git=new ShellGitPort(), files=new RepositoryFilesAdapter(), clock=new SystemClock(), ids=new UuidGenerator();
  const stores=(root:string)=>new YamlProjectStore(root);
  const runtimes=(root:string)=>new SqliteRuntimeStore(root,()=>clock.nowIso());
  const durableMaintenance=(root:string)=>new YamlProjectMaintenance(root,()=>clock.nowIso());
  const authorities=(root:string)=>new LocalGitArtifactAuthority(root);
  const packageRoot=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
  const hostDiagnostics=(root:string)=>new RepositoryHostDiagnostics(root,join(packageRoot,"runtime-assets","omp-extension.ts"));
  const observers=(root:string)=>new LocalMattArtifactObserver(root);
  const registerArtifact=new RegisterArtifact(git,stores,authorities,ids);
  const registerRelation=new RegisterRelation(git,stores,clock,ids);
  const evidence=new UnknownEvidencePort();
  const reconcileWork=new ReconcileWork(git,stores,runtimes,evidence,clock);
  const reconcileChange=new ReconcileChange(git,stores,runtimes,authorities,clock);
  const checkpoint=new LifecycleCheckpoint(git,stores,runtimes,reconcileWork);
  const pendingInteraction=new GetPendingInteraction(git,stores,runtimes);
  const bindWork=new BindWork(git,stores,runtimes,authorities,clock,ids);
  const returnToDesign=new ReturnToDesign(git,stores,runtimes);
  const resolveBlock=new ResolveBlock(git,stores,runtimes,clock);
  const resolveInteraction=new ResolveInteraction(git,stores,runtimes,clock,bindWork,resolveBlock);
  const hostLifecycle=new HandleHostLifecycle(new GetCurrentWork(git,stores,runtimes,clock),bindWork,checkpoint,new RouteContext(git,stores,authorities,clock),pendingInteraction,resolveInteraction,returnToDesign,resolveBlock);
  const gitHookInstaller=new GitHookInstaller();
  const archivePort=new LocalProjectArchive();
  return {
    init:new InitProject(git,stores,runtimes,files,clock,ids),
    status:new GetStatus(git,stores,runtimes),
    doctor:new Doctor(git,stores,runtimes,durableMaintenance,authorities,hostDiagnostics,reconcileWork),
    migrate:new MigrateProject(git,durableMaintenance,runtimes),
    hostDoctor:new HostDoctor(git,hostDiagnostics),
    archive:{ create:new ArchiveProject(git,stores,archivePort,clock,ids), verify:new VerifyArchive(archivePort) },
    change:{ open:new OpenChange(git,stores,clock,ids), list:new ListChanges(git,stores), get:new GetChange(git,stores) },
    artifact:{ register:registerArtifact, list:new ListArtifacts(git,stores) },
    relation:{ register:registerRelation, list:new ListRelations(git,stores) },
    work:{ bind:bindWork, current:new GetCurrentWork(git,stores,runtimes,clock), suppressSession:new SuppressSession(git,stores,runtimes,clock) },
    matt:{ scan:new ScanMattArtifacts(git,stores,observers,registerArtifact,registerRelation) },
    context:{ route:new RouteContext(git,stores,authorities,clock) },
    reconcile:{ work:reconcileWork, change:reconcileChange },
    interaction:{ pending:pendingInteraction, resolve:resolveInteraction, returnToDesign, resolveBlock },
    host:{ lifecycle:hostLifecycle },
    lifecycle:{
      checkpoint,
      installGitHook: async (cwd:string, command?:string) => gitHookInstaller.install(await git.getHooksDirectory(cwd), command),
    },
  };
}
