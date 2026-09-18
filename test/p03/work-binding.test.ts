import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/cli/composition-root.js";
import { ContinuumError } from "../../src/shared/errors/continuum-error.js";
import { createRepo, git } from "../helpers/git.js";

process.env.CONTINUUM_DEV_FALLBACKS = "1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE = "1";

function temp(prefix:string){ return mkdtempSync(join(tmpdir(),prefix)); }

async function prepareFormalWork(repo:string, ticketId="P03") {
  const app=createApp();
  await app.init.execute(repo,"P03 Fixture");
  mkdirSync(join(repo,"docs"),{recursive:true});
  writeFileSync(join(repo,"docs",`${ticketId.toLowerCase()}.md`),`# ${ticketId}\n`,`utf8`);
  const change=await app.change.open.execute(repo,"User Memory");
  await app.artifact.register.execute(repo,{artifactId:ticketId,type:"ticket",authority:"git-file",locator:`docs/${ticketId.toLowerCase()}.md`,title:ticketId});
  await app.relation.register.execute(repo,{from:ticketId,to:change.changeId,type:"belongs_to",routing:"required"});
  git(repo,"add","."); git(repo,"commit","-m","prepare formal work");
  return { app, change, baseline:git(repo,"rev-parse","HEAD") };
}

test("binding freezes work baseline and re-binding same ticket is idempotent", async()=>{
  const repo=temp("continuum-p03-bind-"); createRepo(repo);
  try{
    const {app,baseline}=await prepareFormalWork(repo);
    const first=await app.work.bind.execute(repo,{targetArtifactId:"P03",bindingSource:"test",sessionId:"codex-1",host:"codex"});
    assert.equal(first.created,true);
    assert.equal(first.binding.workStartRevision,baseline);
    assert.equal(first.binding.targetArtifactId,"P03");
    assert.equal(first.sessionBound,true);

    writeFileSync(join(repo,"implementation.txt"),"change\n","utf8"); git(repo,"add","implementation.txt"); git(repo,"commit","-m","implementation");
    const second=await app.work.bind.execute(repo,{targetArtifactId:"P03",bindingSource:"test"});
    assert.equal(second.created,false);
    assert.equal(second.binding.workStartRevision,baseline,"resume must never move the Work Baseline");
    assert.notEqual(git(repo,"rev-parse","HEAD"),baseline);
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("new host session resumes worktree binding while session suppression remains local", async()=>{
  const repo=temp("continuum-p03-resume-"); createRepo(repo);
  try{
    const {app}=await prepareFormalWork(repo);
    const bound=await app.work.bind.execute(repo,{targetArtifactId:"P03",sessionId:"codex-1",host:"codex"});

    const omp=await app.work.current.execute(repo,{sessionId:"omp-1",host:"omp"});
    assert.equal(omp.mode,"managed"); assert.equal(omp.binding?.workId,bound.binding.workId); assert.equal(omp.sessionBound,true);

    await app.work.suppressSession.execute(repo,{sessionId:"omp-1",host:"omp",reason:"temporary ad-hoc work"});
    const suppressed=await app.work.current.execute(repo,{sessionId:"omp-1",host:"omp"});
    assert.equal(suppressed.mode,"aware"); assert.equal(suppressed.suppressed,true); assert.equal(suppressed.binding?.targetArtifactId,"P03");

    const codex2=await app.work.current.execute(repo,{sessionId:"codex-2",host:"codex"});
    assert.equal(codex2.mode,"managed"); assert.equal(codex2.suppressed,false); assert.equal(codex2.binding?.workId,bound.binding.workId);
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("work binding refuses ambiguous change ownership and implicit target replacement", async()=>{
  const ambiguous=temp("continuum-p03-ambiguous-"); createRepo(ambiguous);
  try{
    const {app}=await prepareFormalWork(ambiguous);
    const second=await app.change.open.execute(ambiguous,"Other Change");
    await app.relation.register.execute(ambiguous,{from:"P03",to:second.changeId,type:"belongs_to",routing:"required"});
    await assert.rejects(()=>app.work.bind.execute(ambiguous,{targetArtifactId:"P03"}),(error:unknown)=>error instanceof ContinuumError && error.code==="CONTINUUM_WORK_AMBIGUOUS");
  }finally{rmSync(ambiguous,{recursive:true,force:true});}

  const conflict=temp("continuum-p03-conflict-"); createRepo(conflict);
  try{
    const {app,change}=await prepareFormalWork(conflict);
    writeFileSync(join(conflict,"docs","p04.md"),"# P04\n","utf8");
    await app.artifact.register.execute(conflict,{artifactId:"P04",type:"ticket",authority:"git-file",locator:"docs/p04.md"});
    await app.relation.register.execute(conflict,{from:"P04",to:change.changeId,type:"belongs_to",routing:"required"});
    git(conflict,"add","."); git(conflict,"commit","-m","add p04");
    const p03=await app.work.bind.execute(conflict,{targetArtifactId:"P03"});
    await assert.rejects(()=>app.work.bind.execute(conflict,{targetArtifactId:"P04"}),(error:unknown)=>error instanceof ContinuumError && error.code==="CONTINUUM_WORK_CONFLICT");
    const current=await app.work.current.execute(conflict);
    assert.equal(current.binding?.workId,p03.binding.workId);
    assert.equal(current.binding?.targetArtifactId,"P03");
  }finally{rmSync(conflict,{recursive:true,force:true});}
});
