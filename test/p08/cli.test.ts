import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRepo, git } from "../helpers/git.js";
import { SqliteRuntimeStore } from "../../src/adapters/storage/sqlite-runtime-store/sqlite-runtime-store.js";
import type { InteractionRequest } from "../../src/domain/interaction/interaction.js";

process.env.CONTINUUM_DEV_FALLBACKS="1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";
const CLI=resolve("dist-test/src/cli/index.js");
function temp(prefix:string){return mkdtempSync(join(tmpdir(),prefix));}
function run(repo:string,args:string[]){return JSON.parse(execFileSync(process.execPath,[CLI,...args,"--json"],{cwd:repo,encoding:"utf8",env:process.env}));}
function hostEvent(repo:string,payload:any){
  const result=spawnSync(process.execPath,[CLI,"host","omp","event","--json"],{cwd:repo,encoding:"utf8",input:JSON.stringify(payload),env:process.env});
  if(result.status!==0) throw new Error(result.stderr||result.stdout);
  return JSON.parse(result.stdout);
}

test("OMP CLI event bridge binds and resumes through the same Core",()=>{
  const repo=temp("continuum-p08-cli-"); createRepo(repo);
  try{
    run(repo,["init","--name","P08 CLI"]);
    mkdirSync(join(repo,"docs"),{recursive:true}); writeFileSync(join(repo,"docs","spec.md"),"# Spec\n"); writeFileSync(join(repo,"docs","p03.md"),"# P03\n"); writeFileSync(join(repo,"CONTEXT.md"),"# Context\n"); git(repo,"add","."); git(repo,"commit","-m","fixture");
    const change=run(repo,["change","open","User Memory"]).data.changeId;
    run(repo,["artifact","register","docs/spec.md","--type","spec","--id","SPEC-001","--change",change]);
    run(repo,["artifact","register","docs/p03.md","--type","ticket","--id","P03","--change",change]);
    run(repo,["artifact","register","CONTEXT.md","--type","context","--id","CONTEXT"]);
    run(repo,["relation","add","P03","belongs_to","SPEC-001"]); run(repo,["relation","add","P03","domain_context","CONTEXT"]);
    git(repo,"add","."); git(repo,"commit","-m","graph");
    const bind=hostEvent(repo,{event_name:"before_agent_start",session_id:"o1",cwd:repo,prompt:"implement P03"});
    assert.equal(bind.data.state,"MANAGED"); assert.equal(bind.data.targetArtifactId,"P03");
    const resume=hostEvent(repo,{event_name:"session_start",session_id:"o2",cwd:repo});
    assert.equal(resume.data.state,"MANAGED"); assert.equal(resume.data.targetArtifactId,"P03");
  }finally{rmSync(repo,{recursive:true,force:true});}
});


test("BLOCK CLI returns to design, detects committed design changes, then restarts Work by explicit decision",async()=>{
  const repo=temp("continuum-p08-block-cli-"); createRepo(repo);
  try{
    run(repo,["init","--name","P08 BLOCK CLI"]);
    mkdirSync(join(repo,"docs"),{recursive:true});
    writeFileSync(join(repo,"docs","spec.md"),"# Spec\n");
    writeFileSync(join(repo,"docs","p03.md"),"# P03\n");
    git(repo,"add","."); git(repo,"commit","-m","fixture");
    const change=run(repo,["change","open","User Memory"]).data.changeId;
    run(repo,["artifact","register","docs/spec.md","--type","spec","--id","SPEC-001","--change",change]);
    run(repo,["artifact","register","docs/p03.md","--type","ticket","--id","P03","--change",change]);
    run(repo,["relation","add","P03","belongs_to","SPEC-001"]);
    git(repo,"add","."); git(repo,"commit","-m","graph");
    run(repo,["work","bind","P03","--source","test"]);

    const runtime=new SqliteRuntimeStore(repo,()=>new Date().toISOString()); await runtime.initialize();
    const specVersion=git(repo,"rev-parse","HEAD:docs/spec.md");
    const block:InteractionRequest={id:"int_cli_block",type:"BLOCK",title:"P03 暂停实现：发现设计冲突",message:"Return to design",context:{scope:"change",changeId:change,affectedTickets:["P03"],blockPhase:"implementation",designArtifacts:[{artifactId:"SPEC-001",type:"spec",version:specVersion}]},blocking:true,createdAt:new Date().toISOString()};
    await runtime.savePendingInteraction(block);

    const returned=run(repo,["block","return-to-design","int_cli_block"]);
    assert.equal(returned.data.blockerStillActive,true);
    assert.equal(run(repo,["work","current"]).data.binding,null);

    const unchanged=spawnSync(process.execPath,[CLI,"work","bind","P03","--json"],{cwd:repo,encoding:"utf8",env:process.env});
    assert.notEqual(unchanged.status,0); assert.match(unchanged.stdout,/CONTINUUM_BLOCKED/);

    writeFileSync(join(repo,"docs","spec.md"),"# Spec\n\nUpdated permission boundary.\n");
    git(repo,"add","docs/spec.md"); git(repo,"commit","-m","update design");
    const retry=hostEvent(repo,{event_name:"before_agent_start",session_id:"o-restart",cwd:repo,prompt:"implement P03"});
    assert.equal(retry.data.state,"DECISION");
    assert.equal(retry.data.interaction.context.kind,"restart-blocked-work");

    const decisionId=retry.data.interaction.id;
    const resolved=run(repo,["host","omp","interaction","resolve",decisionId,"--option","restart-work","--session","o-restart"]);
    assert.equal(resolved.data.restartedWork.targetArtifactId,"P03");
    assert.equal(await runtime.loadPendingInteraction("int_cli_block"),null);
    const current=run(repo,["work","current","--session","o-restart","--host","omp"]).data;
    assert.equal(current.binding.targetArtifactId,"P03");
    assert.equal(current.binding.workStartRevision,git(repo,"rev-parse","HEAD"));
  }finally{rmSync(repo,{recursive:true,force:true});}
});
