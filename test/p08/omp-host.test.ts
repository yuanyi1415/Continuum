import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/cli/composition-root.js";
import { SqliteRuntimeStore } from "../../src/adapters/storage/sqlite-runtime-store/sqlite-runtime-store.js";
import { decodeOmpEvent, encodeOmpEvent } from "../../src/adapters/hosts/omp/omp-extension-protocol.js";
import { OmpHostInstaller } from "../../src/adapters/hosts/omp/omp-host-installer.js";
import { OmpCapabilityDetector } from "../../src/adapters/hosts/omp/omp-capability-detector.js";
import type { InteractionRequest } from "../../src/domain/interaction/interaction.js";
import { createRepo, git } from "../helpers/git.js";

process.env.CONTINUUM_DEV_FALLBACKS="1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";
function temp(prefix:string){return mkdtempSync(join(tmpdir(),prefix));}

async function prepare(repo:string){
  const app=createApp(); await app.init.execute(repo,"P08 Fixture");
  mkdirSync(join(repo,"docs"),{recursive:true});
  writeFileSync(join(repo,"docs","spec.md"),"# Spec\n","utf8");
  writeFileSync(join(repo,"docs","p03.md"),"# P03\n","utf8");
  writeFileSync(join(repo,"CONTEXT.md"),"# Domain\n","utf8");
  const change=await app.change.open.execute(repo,"User Memory");
  await app.artifact.register.execute(repo,{artifactId:"SPEC-001",type:"spec",authority:"git-file",locator:"docs/spec.md"});
  await app.artifact.register.execute(repo,{artifactId:"P03",type:"ticket",authority:"git-file",locator:"docs/p03.md"});
  await app.artifact.register.execute(repo,{artifactId:"CONTEXT",type:"context",authority:"git-file",locator:"CONTEXT.md"});
  await app.relation.register.execute(repo,{from:"SPEC-001",to:change.changeId,type:"belongs_to",routing:"required"});
  await app.relation.register.execute(repo,{from:"P03",to:change.changeId,type:"belongs_to",routing:"required"});
  await app.relation.register.execute(repo,{from:"P03",to:"SPEC-001",type:"belongs_to",routing:"required"});
  await app.relation.register.execute(repo,{from:"P03",to:"CONTEXT",type:"domain_context",routing:"required"});
  git(repo,"add","."); git(repo,"commit","-m","prepare P08 fixture");
  return {app,change,baseline:git(repo,"rev-parse","HEAD")};
}

test("OMP protocol maps stable host lifecycle events without relying on input",()=>{
  const start=decodeOmpEvent({event_name:"session_start",session_id:"o1",cwd:"/repo"},"/fallback");
  assert.equal(start?.event,"SESSION_START"); assert.equal(start?.host,"omp");
  const prompt=decodeOmpEvent({event_name:"before_agent_start",session_id:"o1",cwd:"/repo",prompt:"implement P03"},"/fallback");
  assert.equal(prompt?.event,"USER_PROMPT"); assert.equal(prompt?.prompt,"implement P03");
  assert.equal(decodeOmpEvent({event_name:"session_stop",session_id:"o1"},"/repo")?.event,"STABLE_CHECKPOINT");
  assert.equal(decodeOmpEvent({event_name:"session_shutdown",session_id:"o1"},"/repo")?.event,"SESSION_END");
  assert.equal(decodeOmpEvent({event_name:"input",session_id:"o1"},"/repo"),null);
  assert.deepEqual(encodeOmpEvent({state:"MANAGED",targetArtifactId:"P03",contextSummary:"ctx"}),{state:"MANAGED",targetArtifactId:"P03",contextSummary:"ctx"});
});

test("OMP lifecycle binds explicit work, resumes Codex-bound work, checkpoints and keeps suppression session-local",async()=>{
  const repo=temp("continuum-p08-lifecycle-"); createRepo(repo);
  try{
    const {app,baseline}=await prepare(repo);
    const adhoc=await app.host.lifecycle.execute({host:"omp",event:"USER_PROMPT",sessionId:"o1",cwd:repo,prompt:"explain docs/p03.md",source:"test"});
    assert.equal(adhoc.state,"SILENT"); assert.equal((await app.work.current.execute(repo)).binding,null);

    const bind=await app.host.lifecycle.execute({host:"omp",event:"USER_PROMPT",sessionId:"o1",cwd:repo,prompt:"implement P03; do not modify files",source:"test"});
    assert.equal(bind.state,"MANAGED"); assert.equal(bind.targetArtifactId,"P03");
    assert.equal((await app.work.current.execute(repo)).binding?.workStartRevision,baseline);

    writeFileSync(join(repo,"implementation.ts"),"export const done=true;\n"); git(repo,"add","implementation.ts"); git(repo,"commit","-m","implement P03");
    const stop=await app.host.lifecycle.execute({host:"omp",event:"STABLE_CHECKPOINT",sessionId:"o1",cwd:repo,source:"omp:session_stop"});
    assert.equal(stop.checkpoint?.status,"RECONCILED");
    const shutdown=await app.host.lifecycle.execute({host:"omp",event:"SESSION_END",sessionId:"o1",cwd:repo,source:"omp:session_shutdown"});
    assert.equal(shutdown.checkpoint?.reconcile?.status,"DEDUPED");

    await app.work.suppressSession.execute(repo,{sessionId:"o1",host:"omp",reason:"temporary ad-hoc"});
    const suppressed=await app.host.lifecycle.execute({host:"omp",event:"SESSION_START",sessionId:"o1",cwd:repo,source:"test"});
    assert.equal(suppressed.state,"SILENT");
    const fresh=await app.host.lifecycle.execute({host:"omp",event:"SESSION_START",sessionId:"o2",cwd:repo,source:"test"});
    assert.equal(fresh.state,"MANAGED"); assert.equal(fresh.targetArtifactId,"P03");
    assert.equal((await app.work.current.execute(repo)).binding?.workStartRevision,baseline);

    // A Codex-bound worktree must be visible to a fresh OMP session as the same continuity fact.
    const repo2=temp("continuum-p08-cross-host-"); createRepo(repo2);
    try{
      const prepared=await prepare(repo2);
      await prepared.app.host.lifecycle.execute({host:"codex",event:"USER_PROMPT",sessionId:"c1",cwd:repo2,prompt:"/implement P03",source:"test"});
      const resumed=await prepared.app.host.lifecycle.execute({host:"omp",event:"SESSION_START",sessionId:"o-cross",cwd:repo2,source:"test"});
      assert.equal(resumed.state,"MANAGED"); assert.equal(resumed.targetArtifactId,"P03");
      assert.equal((await prepared.app.work.current.execute(repo2)).binding?.workStartRevision,prepared.baseline);
    } finally { rmSync(repo2,{recursive:true,force:true}); }
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("OMP interactions expose simple/heavy decisions and BLOCK without allowing implicit resolution",async()=>{
  const repo=temp("continuum-p08-interaction-"); createRepo(repo);
  try{
    const {app,change}=await prepare(repo);
    const runtime=new SqliteRuntimeStore(repo,()=>new Date().toISOString()); await runtime.initialize();
    const simple:InteractionRequest={id:"int_simple",type:"DECISION",title:"Choose Change",message:"Pick destination",options:[{id:"a",label:"A"},{id:"b",label:"B"}],blocking:true,createdAt:new Date().toISOString()};
    await runtime.savePendingInteraction(simple);
    const decision=await app.host.lifecycle.execute({host:"omp",event:"USER_PROMPT",sessionId:"o1",cwd:repo,prompt:"continue",source:"test"});
    assert.equal(decision.state,"DECISION"); assert.equal(decision.interaction?.id,"int_simple");
    await app.interaction.resolve.execute(repo,{interactionId:"int_simple",host:"omp",action:"accept",selectedOption:"b"});
    assert.equal(await runtime.loadPendingInteraction("int_simple"),null);

    const heavy:InteractionRequest={id:"int_arch",type:"DECISION",title:"Architecture decision required",message:"A new permission boundary requires an ADR before this Change can close.",reason:"Architecture impact",options:[{id:"adr",label:"Return to ADR"},{id:"active",label:"Keep active"}],blocking:true,createdAt:new Date().toISOString()};
    await runtime.savePendingInteraction(heavy);
    const arch=await app.host.lifecycle.execute({host:"omp",event:"USER_PROMPT",sessionId:"o2",cwd:repo,prompt:"continue",source:"test"});
    assert.equal(arch.state,"DECISION"); assert.equal(arch.interaction?.id,"int_arch");
    await app.interaction.resolve.execute(repo,{interactionId:"int_arch",host:"omp",action:"accept",selectedOption:"adr"});

    await app.host.lifecycle.execute({host:"omp",event:"USER_PROMPT",sessionId:"o3",cwd:repo,prompt:"implement P03",source:"test"});
    const specVersion=git(repo,"rev-parse","HEAD:docs/spec.md");
    const block:InteractionRequest={id:"int_block",type:"BLOCK",title:"P03 暂停实现：发现设计冲突",message:"当前实现与 Spec 核心假设冲突。",context:{scope:"change",changeId:change.changeId,affectedTickets:["P03"],blockPhase:"implementation",designArtifacts:[{artifactId:"SPEC-001",type:"spec",version:specVersion}]},blocking:true,createdAt:new Date().toISOString()};
    await runtime.savePendingInteraction(block);
    const blocked=await app.host.lifecycle.execute({host:"omp",event:"USER_PROMPT",sessionId:"o3",cwd:repo,prompt:"keep coding",source:"test"});
    assert.equal(blocked.state,"BLOCKED"); assert.equal(blocked.interaction?.id,"int_block");

    await assert.rejects(
      app.work.suppressSession.execute(repo,{sessionId:"o3",host:"omp",reason:"try bypass"}),
      (error:any)=>error?.code==="CONTINUUM_BLOCKED",
    );

    const returned=await app.interaction.returnToDesign.execute(repo,{interactionId:"int_block",sessionId:"o3",host:"omp"});
    assert.equal(returned.blockerStillActive,true);
    assert.equal((await app.work.current.execute(repo)).binding,null);
    assert.equal((await runtime.loadPendingInteraction("int_block"))?.context?.blockPhase,"design");

    const designPrompt=await app.host.lifecycle.execute({host:"omp",event:"USER_PROMPT",sessionId:"o3",cwd:repo,prompt:"review the Spec and propose a safer design",source:"test"});
    assert.equal(designPrompt.state,"SILENT");
    const unchanged=await app.host.lifecycle.execute({host:"omp",event:"USER_PROMPT",sessionId:"o3",cwd:repo,prompt:"implement P03",source:"test"});
    assert.equal(unchanged.state,"BLOCKED");
    assert.match(unchanged.interaction?.title??"",/还不能继续/);

    writeFileSync(join(repo,"docs","spec.md"),"# Spec\n\nUpdated permission boundary.\n","utf8");
    git(repo,"add","docs/spec.md"); git(repo,"commit","-m","update design for P03");
    const restart=await app.host.lifecycle.execute({host:"omp",event:"USER_PROMPT",sessionId:"o3",cwd:repo,prompt:"implement P03",source:"test"});
    assert.equal(restart.state,"DECISION");
    assert.equal(restart.interaction?.context?.kind,"restart-blocked-work");
    assert.match(restart.interaction?.title??"",/设计已更新/);

    const resolved=await app.interaction.resolve.execute(repo,{interactionId:restart.interaction!.id,host:"omp",sessionId:"o3",selectedOption:"restart-work"});
    assert.equal(resolved.restartedWork?.targetArtifactId,"P03");
    assert.equal(await runtime.loadPendingInteraction("int_block"),null);
    const rebound=await app.work.current.execute(repo,{sessionId:"o3",host:"omp"});
    assert.equal(rebound.mode,"managed");
    assert.equal(rebound.binding?.targetArtifactId,"P03");
    assert.equal(rebound.binding?.workStartRevision,git(repo,"rev-parse","HEAD"));
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("OMP host installer creates one project extension and merges instructions idempotently",async()=>{
  const repo=temp("continuum-p08-install-"); createRepo(repo);
  try{
    writeFileSync(join(repo,"AGENTS.md"),"# Existing rules\n","utf8");
    const asset=join(repo,"asset.ts"); writeFileSync(asset,"export default function extension() {}\n","utf8");
    const installer=new OmpHostInstaller();
    const first=await installer.install(repo,asset); const second=await installer.install(repo,asset);
    assert.equal(first.extensionInstalled,true); assert.equal(second.extensionInstalled,false); assert.equal(second.instructionsUpdated,false);
    assert.equal(readFileSync(join(repo,".omp","extensions","continuum.ts"),"utf8"),"export default function extension() {}\n");
    const agents=readFileSync(join(repo,"AGENTS.md"),"utf8");
    assert.match(agents,/# Existing rules/); assert.equal((agents.match(/continuum:omp:start/g)??[]).length,1); assert.match(agents,/Session suppression must not bypass a design conflict/);
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("OMP capability detector is help-derived instead of version-gated",async()=>{
  const calls:string[]=[];
  const detector=new OmpCapabilityDetector(async(command,args)=>{
    calls.push([command,...args].join(" "));
    if(args[0]==="--version") return {stdout:"omp/18.2.1\n",stderr:""};
    if(args[0]==="--help") return {stdout:"--extension=<value> --hook=<value> --print\n",stderr:""};
    throw new Error("unexpected");
  });
  const result=await detector.detect();
  assert.equal(result.installed,true); assert.equal(result.version,"omp/18.2.1"); assert.equal(result.lifecycleHooks,true); assert.equal(result.projectExtensions,true); assert.equal(result.ambientWidget,true); assert.equal(result.structuredDecision,true); assert.equal(result.headless,true); assert.ok(calls.length>=2);
});

test("production OMP extension uses single widget and stable lifecycle events",()=>{
  const asset=readFileSync(join(process.cwd(),"runtime-assets","omp-extension.ts"),"utf8");
  assert.match(asset,/pi\.on\("session_start"/);
  assert.match(asset,/pi\.on\("before_agent_start"/);
  assert.match(asset,/pi\.on\("session_stop"/);
  assert.match(asset,/pi\.on\("session_shutdown"/);
  assert.match(asset,/setWidget\(WIDGET_KEY/);
  assert.doesNotMatch(asset,/setStatus\(/);
  assert.match(asset,/ctx\.ui\.select/);
  assert.match(asset,/overlay:true/);
  assert.match(asset,/pi\.registerCommand\("continuum-off"/);
  assert.doesNotMatch(asset,/pi\.registerCommand\("continuum-resolve-block"/);
  assert.match(asset,/restart-blocked-work/);
  assert.match(asset,/UI_WAIT_TIMEOUT_MS=25_000/);
  assert.match(asset,/timeout:UI_WAIT_TIMEOUT_MS/);
  assert.match(asset,/blockPhase/);
  assert.doesNotMatch(asset,/canResolveBlock/);
  assert.doesNotMatch(asset,/pi\.on\("input"/);
  assert.doesNotMatch(asset,/process\.execPath/);
  assert.match(asset,/CONTINUUM_NODE_BIN/);
  assert.match(asset,/command:"continuum"/);
});
