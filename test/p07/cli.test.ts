import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepo, git } from "../helpers/git.js";

process.env.CONTINUUM_DEV_FALLBACKS="1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";
function temp(prefix:string){return mkdtempSync(join(tmpdir(),prefix));}
function cliPath(){return join(process.cwd(),"dist-test","src","cli","index.js");}
function cli(repo:string,...args:string[]):any{
  const out=execFileSync(process.execPath,[cliPath(),...args,"--json"],{cwd:repo,encoding:"utf8",env:{...process.env,CONTINUUM_DEV_FALLBACKS:"1",CONTINUUM_DEV_ALLOW_NODE_SQLITE:"1"}});
  return JSON.parse(out);
}
function hook(repo:string,payload:Record<string,unknown>):any{
  const result=spawnSync(process.execPath,[cliPath(),"host","codex","hook"],{cwd:repo,encoding:"utf8",input:JSON.stringify(payload),env:{...process.env,CONTINUUM_DEV_FALLBACKS:"1",CONTINUUM_DEV_ALLOW_NODE_SQLITE:"1"}});
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
}

function prepare(repo:string){
  cli(repo,"init","--name","P07 CLI"); mkdirSync(join(repo,"docs"),{recursive:true});
  writeFileSync(join(repo,"docs","spec.md"),"# Spec\n"); writeFileSync(join(repo,"docs","p03.md"),"# P03\n"); writeFileSync(join(repo,"CONTEXT.md"),"# Context\n");
  const change=cli(repo,"change","open","User Memory").data;
  cli(repo,"artifact","register","docs/spec.md","--type","spec","--id","SPEC-001","--change",change.changeId);
  cli(repo,"artifact","register","docs/p03.md","--type","ticket","--id","P03","--change",change.changeId);
  cli(repo,"artifact","register","CONTEXT.md","--type","context","--id","CONTEXT");
  cli(repo,"relation","add","P03","belongs_to","SPEC-001","--routing","required");
  cli(repo,"relation","add","P03","domain_context","CONTEXT","--routing","required");
  git(repo,"add","."); git(repo,"commit","-m","prepare P07 CLI fixture");
  return {change,baseline:git(repo,"rev-parse","HEAD")};
}

test("Codex hook CLI binds explicit work, resumes and checkpoints without visible status noise",()=>{
  const repo=temp("continuum-p07-cli-"); createRepo(repo);
  try{
    const {baseline}=prepare(repo);
    let response=hook(repo,{hook_event_name:"UserPromptSubmit",cwd:repo,session_id:"c1",prompt:"explain P03"});
    assert.equal(response.continue,true); assert.equal(response.suppressOutput,true);
    assert.equal(cli(repo,"work","current").data.binding,null);

    response=hook(repo,{hook_event_name:"UserPromptSubmit",cwd:repo,session_id:"c1",prompt:"/implement P03"});
    assert.equal(response.continue,true); assert.equal(response.suppressOutput,true); assert.match(response.hookSpecificOutput.additionalContext,/Managed Work P03/);
    assert.equal(cli(repo,"work","current").data.binding.workStartRevision,baseline);

    writeFileSync(join(repo,"implementation.ts"),"export const value = 1;\n"); git(repo,"add","implementation.ts"); git(repo,"commit","-m","implement P03");
    response=hook(repo,{hook_event_name:"SessionStart",cwd:repo,session_id:"c2"});
    assert.equal(response.continue,true); assert.equal(response.suppressOutput,true); assert.match(response.hookSpecificOutput.additionalContext,/P03/);
    hook(repo,{hook_event_name:"Stop",cwd:repo,session_id:"c2"});
    const reconciled=cli(repo,"reconcile").data;
    assert.equal(reconciled.status,"DEDUPED"); assert.equal(reconciled.candidate.baseRevision,baseline);
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("Codex hook CLI is a no-op outside Continuum projects",()=>{
  const repo=temp("continuum-p07-no-project-"); createRepo(repo);
  try{
    const response=hook(repo,{hook_event_name:"SessionStart",cwd:repo,session_id:"c1"});
    assert.deepEqual(response,{continue:true,suppressOutput:true});
  }finally{rmSync(repo,{recursive:true,force:true});}
});
