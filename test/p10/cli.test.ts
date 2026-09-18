import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepo, git } from "../helpers/git.js";
import { createApp } from "../../src/cli/composition-root.js";
import { SqliteRuntimeStore } from "../../src/adapters/storage/sqlite-runtime-store/sqlite-runtime-store.js";

process.env.CONTINUUM_DEV_FALLBACKS="1"; process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";
const CLI=join(process.cwd(),"dist-test","src","cli","index.js"); const pass={status:"PASS" as const,source:"p10-cli"};
function temp(prefix:string){return mkdtempSync(join(tmpdir(),prefix));}
function run(repo:string,args:string[]):any{const out=execFileSync(process.execPath,[CLI,...args,"--json"],{cwd:repo,encoding:"utf8",env:process.env});return JSON.parse(out);}

async function prepare(repo:string){
  createRepo(repo); const app=createApp(); await app.init.execute(repo,"CLI Archive"); mkdirSync(join(repo,"docs"),{recursive:true}); mkdirSync(join(repo,"src"),{recursive:true});
  writeFileSync(join(repo,"docs","spec.md"),"# Spec\n"); writeFileSync(join(repo,"docs","p03.md"),"# P03\n"); const change=await app.change.open.execute(repo,"Done");
  await app.artifact.register.execute(repo,{artifactId:"SPEC-001",type:"spec",authority:"git-file",locator:"docs/spec.md"}); await app.relation.register.execute(repo,{from:"SPEC-001",to:change.changeId,type:"belongs_to",routing:"required"});
  await app.artifact.register.execute(repo,{artifactId:"P03",type:"ticket",authority:"git-file",locator:"docs/p03.md"}); await app.relation.register.execute(repo,{from:"P03",to:change.changeId,type:"belongs_to",routing:"required"});
  git(repo,"add","."); git(repo,"commit","-m","prepare"); const base=git(repo,"rev-parse","HEAD"); writeFileSync(join(repo,"src","x.ts"),"export const x=1;\n"); git(repo,"add","src/x.ts"); git(repo,"commit","-m","implement"); const head=git(repo,"rev-parse","HEAD");
  const binding=(await app.work.bind.execute(repo,{targetArtifactId:"P03",bindingSource:"cli"})).binding; const runtime=new SqliteRuntimeStore(repo,()=>new Date().toISOString()); await runtime.initialize();
  await runtime.savePendingReconcile({workId:binding.workId,baseRevision:base,currentRevision:head,changedFiles:["src/x.ts"],evidence:{tests:pass,review:pass,completion:pass},knowledgeImpact:"N0",actions:["AUTO"],updatedAt:new Date().toISOString()}); await app.reconcile.change.execute(repo,change.changeId);
}

test("archive CLI creates and independently verifies with structured JSON",async()=>{
  const repo=temp("continuum-p10-cli-");
  try{
    await prepare(repo); const created=run(repo,["archive"]); assert.equal(created.ok,true); assert.equal(created.data.status,"complete"); assert.equal(created.data.verified,true);
    const verified=run(repo,["archive","verify",created.data.archive_path]); assert.equal(verified.ok,true); assert.equal(verified.data.archive_id,created.data.archive_id);
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("archive verify exits nonzero for a missing archive",()=>{
  const repo=temp("continuum-p10-cli-missing-"); createRepo(repo);
  try{
    const result=spawnSync(process.execPath,[CLI,"archive","verify",join(repo,"nope"),"--json"],{cwd:repo,encoding:"utf8",env:process.env});
    assert.equal(result.status,2); const parsed=JSON.parse(result.stdout); assert.equal(parsed.ok,false);
  }finally{rmSync(repo,{recursive:true,force:true});}
});
