import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/cli/composition-root.js";
import { SqliteRuntimeStore } from "../../src/adapters/storage/sqlite-runtime-store/sqlite-runtime-store.js";
import { YamlProjectStore } from "../../src/adapters/storage/yaml-project-store/yaml-project-store.js";
import { ShellGitPort } from "../../src/adapters/git/shell-git-port.js";
import { LocalGitArtifactAuthority } from "../../src/adapters/artifact/local-git-artifact-authority.js";
import { ReconcileChange } from "../../src/application/reconcile/reconcile-change.js";
import { SystemClock } from "../../src/shared/time/system-clock.js";
import { ContinuumError } from "../../src/shared/errors/continuum-error.js";
import type { ProjectStorePort } from "../../src/ports/project-store.js";
import type { WorkReconcileCandidate, KnowledgeImpact, WorkReconcileEvidence } from "../../src/domain/reconcile/work-reconcile.js";
import type { WorkBinding } from "../../src/domain/work/work-binding.js";
import { createRepo, git } from "../helpers/git.js";

process.env.CONTINUUM_DEV_FALLBACKS = "1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE = "1";

function temp(prefix:string){ return mkdtempSync(join(tmpdir(),prefix)); }
const passFact = { status:"PASS" as const, source:"p06-fixture" };

async function prepareChange(repo:string, ticketIds=["P03","P04"]) {
  const app=createApp();
  await app.init.execute(repo,"P06 Fixture");
  mkdirSync(join(repo,"docs"),{recursive:true});
  writeFileSync(join(repo,"docs","spec.md"),"# User Memory Spec\n","utf8");
  const change=await app.change.open.execute(repo,"User Memory","Close a complete change");
  await app.artifact.register.execute(repo,{artifactId:"SPEC-001",type:"spec",authority:"git-file",locator:"docs/spec.md",title:"User Memory Spec"});
  await app.relation.register.execute(repo,{from:"SPEC-001",to:change.changeId,type:"belongs_to",routing:"required"});
  for(const id of ticketIds){
    const file=`docs/${id.toLowerCase()}.md`; writeFileSync(join(repo,file),`# ${id}\n`,`utf8`);
    await app.artifact.register.execute(repo,{artifactId:id,type:"ticket",authority:"git-file",locator:file,title:id});
    await app.relation.register.execute(repo,{from:id,to:change.changeId,type:"belongs_to",routing:"required"});
  }
  git(repo,"add","."); git(repo,"commit","-m","prepare change");
  const baseline=git(repo,"rev-parse","HEAD");
  mkdirSync(join(repo,"src"),{recursive:true});
  writeFileSync(join(repo,"src","memory.ts"),"export const memory = true;\n","utf8");
  git(repo,"add","src/memory.ts"); git(repo,"commit","-m","implement change");
  const head=git(repo,"rev-parse","HEAD");
  return {app,change,baseline,head};
}

async function seedCandidate(repo:string, changeId:string, ticketId:string, workId:string, worktreeId:string, base:string, head:string, impact:KnowledgeImpact="N0", evidence:WorkReconcileEvidence = {tests:passFact,review:passFact,completion:passFact}) {
  const runtime=new SqliteRuntimeStore(repo,()=>new Date().toISOString()); await runtime.initialize();
  const binding:WorkBinding={workId,worktreeId,targetArtifactId:ticketId,changeId,workStartRevision:base,boundAt:new Date().toISOString(),bindingSource:"p06-fixture"};
  await runtime.bindWork(binding);
  const candidate:WorkReconcileCandidate={workId,baseRevision:base,currentRevision:head,changedFiles:[`src/${ticketId.toLowerCase()}.ts`],evidence,knowledgeImpact:impact,actions:impact==="N4"?["STOP"]:impact==="N2"||impact==="N3"?["PROPOSE"]:["AUTO"],updatedAt:new Date().toISOString()};
  await runtime.savePendingReconcile(candidate);
  return {runtime,binding,candidate};
}

test("change reconcile durably converges multiple Work candidates and advances Current once", async()=>{
  const repo=temp("continuum-p06-pass-"); createRepo(repo);
  try{
    const {app,change,baseline,head}=await prepareChange(repo);
    const a=await seedCandidate(repo,change.changeId,"P03","work_p03","fixture-wt-a",baseline,head);
    const b=await seedCandidate(repo,change.changeId,"P04","work_p04","fixture-wt-b",baseline,head,"N2");
    const before=(await new YamlProjectStore(repo).loadCurrent()).snapshotId;
    const result=await app.reconcile.change.execute(repo,change.changeId);
    assert.equal(result.status,"CLOSED");
    assert.equal(result.reconcile.result,"pass");
    assert.equal(result.reconcile.resolvedWork.length,2);
    assert.equal(result.reconcile.knowledgeChanges.length,1);
    assert.equal(result.snapshot.baselines[0].revision,head);
    assert.equal(result.snapshot.lastReconcile,result.reconcile.reconcileId);
    assert.ok(!result.snapshot.activeChanges.includes(change.changeId));
    const store=new YamlProjectStore(repo); const current=await store.loadCurrent();
    assert.notEqual(current.snapshotId,before); assert.equal(current.snapshotId,result.snapshot.snapshotId);
    assert.equal((await store.loadChange(change.changeId)).status,"closed");
    assert.ok(await store.hasChangeReconcile(result.reconcile.reconcileId));
    assert.ok(existsSync(join(repo,".continuum","reconciles")));
    assert.equal(await a.runtime.loadPendingReconcile("work_p03"),null);
    assert.equal(await b.runtime.loadPendingReconcile("work_p04"),null);
    assert.equal(await a.runtime.getWorktreeBinding("fixture-wt-a"),null);
    assert.equal(await b.runtime.getWorktreeBinding("fixture-wt-b"),null);
  } finally { rmSync(repo,{recursive:true,force:true}); }
});

test("unknown evidence keeps Change active and does not advance Snapshot", async()=>{
  const repo=temp("continuum-p06-unknown-"); createRepo(repo);
  try{
    const {app,change,baseline,head}=await prepareChange(repo,["P03"]);
    const unknown={status:"UNKNOWN" as const,source:"not-configured"};
    await seedCandidate(repo,change.changeId,"P03","work_p03","fixture-wt",baseline,head,"N0",{tests:passFact,review:passFact,completion:unknown});
    const store=new YamlProjectStore(repo); const before=await store.loadCurrent();
    await assert.rejects(()=>app.reconcile.change.execute(repo,change.changeId),(error:any)=>error instanceof ContinuumError && error.code==="CONTINUUM_EVIDENCE_UNKNOWN");
    assert.equal((await store.loadCurrent()).snapshotId,before.snapshotId);
    assert.equal((await store.loadChange(change.changeId)).status,"active");
  } finally { rmSync(repo,{recursive:true,force:true}); }
});

test("N3 requires a DECISION and N4 creates a blocking interaction without Snapshot advance", async()=>{
  for(const scenario of [{impact:"N3" as const,code:"CONTINUUM_DECISION_REQUIRED",type:"DECISION"},{impact:"N4" as const,code:"CONTINUUM_BLOCKED",type:"BLOCK"}]){
    const repo=temp(`continuum-p06-${scenario.impact.toLowerCase()}-`); createRepo(repo);
    try{
      const {app,change,baseline,head}=await prepareChange(repo,["P03"]);
      await seedCandidate(repo,change.changeId,"P03","work_p03","fixture-wt",baseline,head,scenario.impact);
      const store=new YamlProjectStore(repo); const before=await store.loadCurrent(); let captured:any;
      try { await app.reconcile.change.execute(repo,change.changeId); assert.fail("expected blocking error"); } catch(error){ captured=error; }
      assert.ok(captured instanceof ContinuumError); assert.equal(captured.code,scenario.code);
      const interaction=(captured.details as any)?.interaction; assert.equal(interaction?.type,scenario.type);
      const runtime=new SqliteRuntimeStore(repo,()=>new Date().toISOString());
      const pending=await runtime.loadPendingInteraction(interaction.id); assert.equal(pending?.type,scenario.type);
      assert.equal((await store.loadCurrent()).snapshotId,before.snapshotId);
      assert.equal((await store.loadChange(change.changeId)).status,"active");
      const files=readFileSync(join(repo,".continuum","current.yaml"),"utf8"); assert.ok(files.includes(before.snapshotId));
    } finally { rmSync(repo,{recursive:true,force:true}); }
  }
});

test("Current CAS conflict never overwrites another Snapshot and Change remains active", async()=>{
  const repo=temp("continuum-p06-conflict-"); createRepo(repo);
  try{
    const {change,baseline,head}=await prepareChange(repo,["P03"]);
    await seedCandidate(repo,change.changeId,"P03","work_p03","fixture-wt",baseline,head);
    const realStore=new YamlProjectStore(repo);
    const proxy=new Proxy(realStore,{get(target,prop,receiver){ if(prop==="advanceCurrent") return async()=>{ throw new ContinuumError("CONTINUUM_SNAPSHOT_CONFLICT","simulated concurrent advance",true); }; const value=Reflect.get(target,prop,receiver); return typeof value==="function"?value.bind(target):value; }}) as ProjectStorePort;
    const app=new ReconcileChange(new ShellGitPort(),()=>proxy,(root)=>new SqliteRuntimeStore(root,()=>new Date().toISOString()),(root)=>new LocalGitArtifactAuthority(root),new SystemClock());
    const before=await realStore.loadCurrent();
    await assert.rejects(()=>app.execute(repo,change.changeId),(error:any)=>error instanceof ContinuumError && error.code==="CONTINUUM_SNAPSHOT_CONFLICT");
    assert.equal((await realStore.loadCurrent()).snapshotId,before.snapshotId);
    assert.equal((await realStore.loadChange(change.changeId)).status,"active");
  } finally { rmSync(repo,{recursive:true,force:true}); }
});

test("recovery closes an active Change if Current already points at its passing Reconcile", async()=>{
  const repo=temp("continuum-p06-recover-"); createRepo(repo);
  try{
    const {app,change,baseline,head}=await prepareChange(repo,["P03"]);
    await seedCandidate(repo,change.changeId,"P03","work_p03","fixture-wt",baseline,head);
    const store=new YamlProjectStore(repo);
    const originalSave=store.saveChange.bind(store); let first=true;
    const proxy=new Proxy(store,{get(target,prop,receiver){ if(prop==="saveChange") return async(value:any)=>{ if(value.status==="closed"&&first){ first=false; throw new Error("simulated crash after current advance"); } return originalSave(value); }; const value=Reflect.get(target,prop,receiver); return typeof value==="function"?value.bind(target):value; }}) as ProjectStorePort;
    const rc=new ReconcileChange(new ShellGitPort(),()=>proxy,(root)=>new SqliteRuntimeStore(root,()=>new Date().toISOString()),(root)=>new LocalGitArtifactAuthority(root),new SystemClock());
    await assert.rejects(()=>rc.execute(repo,change.changeId),/simulated crash/);
    assert.equal((await store.loadChange(change.changeId)).status,"active");
    const currentAfterCrash=await store.loadCurrent(); const snapAfterCrash=await store.loadSnapshot(currentAfterCrash.snapshotId); assert.ok(snapAfterCrash.lastReconcile);
    const recovered=await app.reconcile.change.execute(repo,change.changeId);
    assert.equal(recovered.status,"RECOVERED");
    assert.equal((await store.loadChange(change.changeId)).status,"closed");
  } finally { rmSync(repo,{recursive:true,force:true}); }
});


test("Change Reconcile aggregates an integrated candidate from another active Git worktree", async()=>{
  const repo=temp("continuum-p06-main-"); createRepo(repo);
  const linked=temp("continuum-p06-linked-"); rmSync(linked,{recursive:true,force:true});
  try{
    const app=createApp(); await app.init.execute(repo,"P06 Worktree Fixture");
    mkdirSync(join(repo,"docs"),{recursive:true}); writeFileSync(join(repo,"docs","spec.md"),"# Spec\n"); writeFileSync(join(repo,"docs","p03.md"),"# P03\n");
    const change=await app.change.open.execute(repo,"Parallel Change");
    await app.artifact.register.execute(repo,{artifactId:"SPEC-001",type:"spec",authority:"git-file",locator:"docs/spec.md"}); await app.relation.register.execute(repo,{from:"SPEC-001",to:change.changeId,type:"belongs_to",routing:"required"});
    await app.artifact.register.execute(repo,{artifactId:"P03",type:"ticket",authority:"git-file",locator:"docs/p03.md"}); await app.relation.register.execute(repo,{from:"P03",to:change.changeId,type:"belongs_to",routing:"required"});
    git(repo,"add","."); git(repo,"commit","-m","prepare parallel change"); const baseline=git(repo,"rev-parse","HEAD");
    git(repo,"worktree","add","-q","-b","worker",linked);
    mkdirSync(join(linked,"src"),{recursive:true}); writeFileSync(join(linked,"src","worker.ts"),"export const worker=true;\n"); git(linked,"add","src/worker.ts"); git(linked,"commit","-m","implement P03 in worker"); const workerHead=git(linked,"rev-parse","HEAD");
    const linkedFacts=await new ShellGitPort().inspect(linked);
    const runtime=new SqliteRuntimeStore(linked,()=>new Date().toISOString()); await runtime.initialize();
    await runtime.bindWork({workId:"work_parallel",worktreeId:linkedFacts.worktreeIdentity,targetArtifactId:"P03",changeId:change.changeId,workStartRevision:baseline,boundAt:new Date().toISOString(),bindingSource:"linked-test"});
    await runtime.savePendingReconcile({workId:"work_parallel",baseRevision:baseline,currentRevision:workerHead,changedFiles:["src/worker.ts"],evidence:{tests:passFact,review:passFact,completion:passFact},knowledgeImpact:"N0",actions:["AUTO"],updatedAt:new Date().toISOString()});
    git(repo,"merge","--no-ff","worker","-m","merge worker");
    const result=await app.reconcile.change.execute(repo,change.changeId);
    assert.equal(result.status,"CLOSED"); assert.equal(result.reconcile.resolvedWork[0].currentRevision,workerHead);
    assert.equal(await runtime.loadPendingReconcile("work_parallel"),null); assert.equal(await runtime.getWorktreeBinding(linkedFacts.worktreeIdentity),null);
  } finally {
    try{git(repo,"worktree","remove","--force",linked);}catch{}
    rmSync(repo,{recursive:true,force:true}); rmSync(linked,{recursive:true,force:true});
  }
});
