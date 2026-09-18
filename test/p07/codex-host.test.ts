import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/cli/composition-root.js";
import { SqliteRuntimeStore } from "../../src/adapters/storage/sqlite-runtime-store/sqlite-runtime-store.js";
import { CodexHostInstaller } from "../../src/adapters/hosts/codex/codex-host-installer.js";
import { CodexCapabilityDetector } from "../../src/adapters/hosts/codex/codex-capability-detector.js";
import { decodeCodexHook, encodeCodexHook } from "../../src/adapters/hosts/codex/codex-hook-protocol.js";
import { parseExplicitWorkIntent } from "../../src/application/host/host-lifecycle.js";
import type { InteractionRequest } from "../../src/domain/interaction/interaction.js";
import { createRepo, git } from "../helpers/git.js";

process.env.CONTINUUM_DEV_FALLBACKS="1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";
function temp(prefix:string){return mkdtempSync(join(tmpdir(),prefix));}

async function prepare(repo:string){
  const app=createApp(); await app.init.execute(repo,"P07 Fixture");
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
  git(repo,"add","."); git(repo,"commit","-m","prepare P07 fixture");
  return {app,change,baseline:git(repo,"rev-parse","HEAD")};
}

test("explicit Codex intent parser is narrow",()=>{
  assert.equal(parseExplicitWorkIntent("/implement P03"),"P03");
  assert.equal(parseExplicitWorkIntent("implement P03 and continue"),"P03");
  assert.equal(parseExplicitWorkIntent("implement P03; do not modify files"),"P03");
  assert.equal(parseExplicitWorkIntent("/implement P03，先不要改文件"),"P03");
  assert.equal(parseExplicitWorkIntent("OMP transformed user work:\nimplement P03; do not modify files"),"P03");
  assert.equal(parseExplicitWorkIntent("OMP transformed user work: implement P03"),null);
  assert.equal(parseExplicitWorkIntent("please implement P03"),null);
  assert.equal(parseExplicitWorkIntent("look at P03"),null);
});

test("Codex lifecycle keeps ad-hoc silent, binds explicit work, resumes and reconciles idempotently",async()=>{
  const repo=temp("continuum-p07-lifecycle-"); createRepo(repo);
  try{
    const {app,baseline}=await prepare(repo);
    const adhoc=await app.host.lifecycle.execute({host:"codex",event:"USER_PROMPT",sessionId:"c1",cwd:repo,prompt:"explain src/example.ts",source:"test"});
    assert.equal(adhoc.state,"SILENT");
    assert.equal((await app.work.current.execute(repo)).binding,null);

    const bind=await app.host.lifecycle.execute({host:"codex",event:"USER_PROMPT",sessionId:"c1",cwd:repo,prompt:"/implement P03",source:"test"});
    assert.equal(bind.state,"MANAGED"); assert.equal(bind.targetArtifactId,"P03");
    const current=await app.work.current.execute(repo); assert.equal(current.binding?.workStartRevision,baseline);
    assert.match(bind.contextSummary ?? "",/SPEC-001/); assert.match(bind.contextSummary ?? "",/CONTEXT/);

    writeFileSync(join(repo,"implementation.ts"),"export const done = true;\n"); git(repo,"add","implementation.ts"); git(repo,"commit","-m","implement P03");
    const resume=await app.host.lifecycle.execute({host:"codex",event:"SESSION_START",sessionId:"c2",cwd:repo,source:"test"});
    assert.equal(resume.state,"MANAGED"); assert.equal(resume.targetArtifactId,"P03");
    assert.equal((await app.work.current.execute(repo)).binding?.workStartRevision,baseline);

    const stop=await app.host.lifecycle.execute({host:"codex",event:"STABLE_CHECKPOINT",sessionId:"c2",cwd:repo,source:"codex:Stop"});
    assert.equal(stop.checkpoint?.status,"RECONCILED");
    const end=await app.host.lifecycle.execute({host:"codex",event:"SESSION_END",sessionId:"c2",cwd:repo,source:"codex:SessionEnd"});
    assert.equal(end.checkpoint?.reconcile?.status,"DEDUPED");
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("Codex Hook Gate resolves DECISION deterministically and BLOCK fails closed",async()=>{
  const repo=temp("continuum-p07-interaction-"); createRepo(repo);
  try{
    const {app,change}=await prepare(repo);
    const runtime=new SqliteRuntimeStore(repo,()=>new Date().toISOString()); await runtime.initialize();
    const decision:InteractionRequest={id:"int_decision",type:"DECISION",title:"Choose destination",message:"Pick one",options:[{id:"a",label:"A"},{id:"b",label:"B"}],blocking:true,createdAt:new Date().toISOString()};
    await runtime.savePendingInteraction(decision);
    const blocked=await app.host.lifecycle.execute({host:"codex",event:"USER_PROMPT",sessionId:"c1",cwd:repo,prompt:"continue",source:"test"});
    assert.equal(blocked.state,"DECISION");
    const native=await app.host.lifecycle.execute({host:"codex",event:"USER_PROMPT",sessionId:"c1",cwd:repo,prompt:"/continuum decision",source:"test"});
    assert.equal(native.state,"DECISION_MCP");
    const resolved=await app.host.lifecycle.execute({host:"codex",event:"USER_PROMPT",sessionId:"c1",cwd:repo,prompt:"2",source:"test"});
    assert.equal(resolved.decisionResolved?.optionId,"b");
    assert.equal(await runtime.loadPendingInteraction("int_decision"),null);

    await app.host.lifecycle.execute({host:"codex",event:"USER_PROMPT",sessionId:"c1",cwd:repo,prompt:"implement P03",source:"test"});
    const block:InteractionRequest={id:"int_block",type:"BLOCK",title:"Design gap",message:"Return to spec",context:{scope:"change",changeId:change.changeId,affectedTickets:["P03"]},blocking:true,createdAt:new Date().toISOString()};
    await runtime.savePendingInteraction(block);
    const result=await app.host.lifecycle.execute({host:"codex",event:"USER_PROMPT",sessionId:"c1",cwd:repo,prompt:"implement more",source:"test"});
    assert.equal(result.state,"BLOCKED");
    await assert.rejects(
      app.work.suppressSession.execute(repo,{sessionId:"c1",host:"codex",reason:"ad-hoc escape hatch"}),
      (error:any)=>error?.code==="CONTINUUM_BLOCKED",
    );
    const returnToDesign=await app.host.lifecycle.execute({host:"codex",event:"USER_PROMPT",sessionId:"c1",cwd:repo,prompt:"continuum return to design",source:"test"});
    assert.equal(returnToDesign.blockTransition?.action,"returned_to_design");
    const design=await app.host.lifecycle.execute({host:"codex",event:"USER_PROMPT",sessionId:"c1",cwd:repo,prompt:"review the spec",source:"test"});
    assert.equal(design.state,"SILENT");
    const blockedRebind=await app.host.lifecycle.execute({host:"codex",event:"USER_PROMPT",sessionId:"c1",cwd:repo,prompt:"implement P03",source:"test"});
    assert.equal(blockedRebind.state,"BLOCKED");
    const resolvedBlock=await app.host.lifecycle.execute({host:"codex",event:"USER_PROMPT",sessionId:"c1",cwd:repo,prompt:"continuum resolve block",source:"test"});
    assert.equal(resolvedBlock.blockTransition?.action,"resolved");
    const rebound=await app.host.lifecycle.execute({host:"codex",event:"USER_PROMPT",sessionId:"c1",cwd:repo,prompt:"implement P03",source:"test"});
    assert.equal(rebound.state,"MANAGED");
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("Codex hook protocol stays silent by default and uses deterministic block responses",()=>{
  const payload={hook_event_name:"UserPromptSubmit",session_id:"c1",cwd:"/repo",prompt:"/implement P03"};
  const signal=decodeCodexHook(payload,"/fallback");
  assert.equal(signal?.event,"USER_PROMPT"); assert.equal(signal?.sessionId,"c1");
  const silent=encodeCodexHook(payload,{state:"SILENT"}); assert.equal(silent.continue,true); assert.equal(silent.suppressOutput,true);
  const decision=encodeCodexHook(payload,{state:"DECISION",interaction:{id:"int_x",type:"DECISION",title:"Choose",options:[{id:"x",label:"X"}],blocking:true,createdAt:new Date().toISOString()}});
  assert.equal(decision.continue,false); assert.equal(decision.decision,"block"); assert.match(decision.reason ?? "",/1\. X/);
  const native=encodeCodexHook(payload,{state:"DECISION_MCP",interaction:{id:"int_x",type:"DECISION",title:"Choose",options:[{id:"x",label:"X"}],blocking:true,createdAt:new Date().toISOString()}});
  assert.equal(native.continue,true); assert.match(native.hookSpecificOutput?.additionalContext ?? "",/continuum_decision/);
});

test("Codex host installer merges repo hooks idempotently without clobbering existing config",async()=>{
  const repo=temp("continuum-p07-install-"); createRepo(repo);
  try{
    mkdirSync(join(repo,".codex"),{recursive:true});
    writeFileSync(join(repo,".codex","hooks.json"),JSON.stringify({hooks:{SessionStart:[{hooks:[{type:"command",command:"echo existing"}]}]}},null,2));
    writeFileSync(join(repo,".codex","config.toml"),"[features]\nother = true\n\n[model]\nname = 'x'\n");
    const installer=new CodexHostInstaller();
    const first=await installer.install(repo,"/opt/continuum/dist/cli/index.js","/opt/continuum/runtime-assets/codex-mcp-server.mjs",false);
    const second=await installer.install(repo,"/opt/continuum/dist/cli/index.js","/opt/continuum/runtime-assets/codex-mcp-server.mjs",false);
    assert.equal(first.mcp,"skipped"); assert.equal(second.hookInstalled,false);
    const hooks=JSON.parse(readFileSync(join(repo,".codex","hooks.json"),"utf8"));
    assert.equal(hooks.hooks.SessionStart.length,2);
    for(const event of ["SessionStart","UserPromptSubmit","Stop","SessionEnd"]) assert.ok(hooks.hooks[event]?.length>=1);
    const config=readFileSync(join(repo,".codex","config.toml"),"utf8"); assert.match(config,/\[features\][\s\S]*hooks = true/); assert.match(config,/other = true/); assert.match(config,/\[model\]/);
    const agents=readFileSync(join(repo,"AGENTS.md"),"utf8"); assert.match(agents,/continuum:codex:start/); assert.match(agents,/continuum_decision/);
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("Codex capability detector reports hooks and MCP without hard-coding version semantics",async()=>{
  const calls:string[]=[];
  const detector=new CodexCapabilityDetector(async(command,args)=>{calls.push([command,...args].join(" ")); if(args[0]==="--version") return {stdout:"codex-cli 0.154.0\n",stderr:""}; if(args[0]==="--help") return {stdout:"--dangerously-bypass-hook-trust\n",stderr:""}; if(args[0]==="mcp") return {stdout:"mcp help\n",stderr:""}; throw new Error("unexpected");});
  const result=await detector.detect(); assert.equal(result.installed,true); assert.equal(result.lifecycleHooks,true); assert.equal(result.structuredDecision,true); assert.equal(result.version,"codex-cli 0.154.0"); assert.ok(calls.length>=3);
});
