import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ShellGitPort } from "../../src/adapters/git/shell-git-port.js";
import { createApp } from "../../src/cli/composition-root.js";
import { SqliteRuntimeStore } from "../../src/adapters/storage/sqlite-runtime-store/sqlite-runtime-store.js";
import { classifyKnowledgeImpact } from "../../src/domain/reconcile/work-reconcile.js";
import { createRepo, git } from "../helpers/git.js";

process.env.CONTINUUM_DEV_FALLBACKS = "1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE = "1";

function temp(prefix:string){ return mkdtempSync(join(tmpdir(),prefix)); }

async function prepareWork(repo:string) {
  const app=createApp();
  await app.init.execute(repo,"P05 Fixture");
  mkdirSync(join(repo,"docs"),{recursive:true});
  writeFileSync(join(repo,"docs","p03.md"),"# P03\n","utf8");
  const change=await app.change.open.execute(repo,"User Memory");
  await app.artifact.register.execute(repo,{artifactId:"P03",type:"ticket",authority:"git-file",locator:"docs/p03.md",title:"P03"});
  await app.relation.register.execute(repo,{from:"P03",to:change.changeId,type:"belongs_to",routing:"required"});
  git(repo,"add","."); git(repo,"commit","-m","prepare formal work");
  // A pre-binding change proves Work Reconcile starts at the Work Baseline, not the Project Snapshot.
  writeFileSync(join(repo,"adapter-install.txt"),"adapter metadata before work\n","utf8");
  git(repo,"add","adapter-install.txt"); git(repo,"commit","-m","adapter setup before bind");
  const bind=await app.work.bind.execute(repo,{targetArtifactId:"P03",bindingSource:"test"});
  return { app, change, binding:bind.binding, baseline:git(repo,"rev-parse","HEAD") };
}

test("work reconcile uses frozen Work Baseline, noops without changes, and keeps evidence UNKNOWN", async()=>{
  const repo=temp("continuum-p05-base-"); createRepo(repo);
  try{
    const {app,binding,baseline}=await prepareWork(repo);
    assert.equal(binding.workStartRevision,baseline);
    const noChange=await app.reconcile.work.execute(repo);
    assert.equal(noChange.status,"NOOP");

    mkdirSync(join(repo,"src"),{recursive:true});
    writeFileSync(join(repo,"src","example.ts"),"export const value = 1;\n","utf8");
    git(repo,"add","src/example.ts"); git(repo,"commit","-m","implement P03");

    const result=await app.reconcile.work.execute(repo);
    assert.equal(result.status,"UPDATED");
    assert.equal(result.candidate?.baseRevision,baseline);
    assert.deepEqual(result.candidate?.changedFiles,["src/example.ts"]);
    assert.ok(!result.candidate?.changedFiles.includes("adapter-install.txt"),"pre-bind changes must not enter the Work delta");
    assert.equal(result.candidate?.knowledgeImpact,"N0");
    assert.deepEqual(result.candidate?.actions,["AUTO"]);
    assert.equal(result.candidate?.evidence.tests.status,"UNKNOWN");
    assert.equal(result.candidate?.evidence.review.status,"UNKNOWN");
    assert.equal(result.candidate?.evidence.completion.status,"UNKNOWN");
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("duplicate checkpoints dedupe while later commits update one pending candidate", async()=>{
  const repo=temp("continuum-p05-dedupe-"); createRepo(repo);
  try{
    const {app,binding}=await prepareWork(repo);
    writeFileSync(join(repo,"one.txt"),"one\n","utf8"); git(repo,"add","one.txt"); git(repo,"commit","-m","one");
    const first=await app.lifecycle.checkpoint.execute(repo,{source:"stop"});
    assert.equal(first.status,"RECONCILED");
    const same=await app.lifecycle.checkpoint.execute(repo,{source:"session-end"});
    assert.equal(same.reconcile?.status,"DEDUPED");

    writeFileSync(join(repo,"two.txt"),"two\n","utf8"); git(repo,"add","two.txt"); git(repo,"commit","-m","two");
    const second=await app.lifecycle.checkpoint.execute(repo,{source:"post-commit"});
    assert.equal(second.reconcile?.status,"UPDATED");
    const pending=await new SqliteRuntimeStore(repo,()=>new Date().toISOString()).loadPendingReconcile(binding.workId);
    assert.ok(pending);
    assert.equal(pending?.currentRevision,git(repo,"rev-parse","HEAD"));
    assert.deepEqual(pending?.changedFiles.sort(),["one.txt","two.txt"]);
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("lost lifecycle event is recoverable from authoritative Git state", async()=>{
  const repo=temp("continuum-p05-recover-"); createRepo(repo);
  try{
    const {app}=await prepareWork(repo);
    writeFileSync(join(repo,"lost-hook.txt"),"not observed by a hook\n","utf8"); git(repo,"add","lost-hook.txt"); git(repo,"commit","-m","lost hook change");
    // No lifecycle signal was emitted. An explicit later check must rediscover it.
    const recovered=await app.reconcile.work.execute(repo);
    assert.equal(recovered.status,"UPDATED");
    assert.deepEqual(recovered.candidate?.changedFiles,["lost-hook.txt"]);
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("session suppression skips a host checkpoint without destroying later recovery", async()=>{
  const repo=temp("continuum-p05-suppressed-"); createRepo(repo);
  try{
    const {app,binding}=await prepareWork(repo);
    await app.work.current.execute(repo,{sessionId:"omp-1",host:"omp"});
    await app.work.suppressSession.execute(repo,{sessionId:"omp-1",host:"omp",reason:"ad-hoc question"});
    writeFileSync(join(repo,"suppressed.txt"),"change\n","utf8"); git(repo,"add","suppressed.txt"); git(repo,"commit","-m","change during suppressed session");
    const skipped=await app.lifecycle.checkpoint.execute(repo,{source:"session-stop",sessionId:"omp-1",host:"omp"});
    assert.equal(skipped.status,"SUPPRESSED");
    const runtime=new SqliteRuntimeStore(repo,()=>new Date().toISOString());
    assert.equal(await runtime.loadPendingReconcile(binding.workId),null);
    const recovered=await app.lifecycle.checkpoint.execute(repo,{source:"explicit-later-check"});
    assert.equal(recovered.reconcile?.status,"UPDATED");
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("knowledge-impact file signals map to conservative action classes", ()=>{
  assert.equal(classifyKnowledgeImpact(["src/index.ts"]),"N0");
  assert.equal(classifyKnowledgeImpact(["CONTEXT.md"]),"N2");
  assert.equal(classifyKnowledgeImpact(["docs/adr/ADR-001.md"]),"N3");
  assert.equal(classifyKnowledgeImpact(["docs/user-memory-spec.md"]),"N4");
});

test("generic post-commit fallback creates the same pending candidate", async()=>{
  const repo=temp("continuum-p05-hook-"); createRepo(repo);
  try{
    const {app,binding}=await prepareWork(repo);
    const cli=join(process.cwd(),"dist-test","src","cli","index.js");
    const escaped=cli.replaceAll("'", "'\\''");
    const command=`node '${escaped}' lifecycle checkpoint --source git-post-commit >/dev/null 2>&1 || true`;
    const install=await app.lifecycle.installGitHook(repo,command);
    assert.equal(install.updated,true);
    assert.ok(existsSync(install.path));
    assert.match(readFileSync(install.path,"utf8"),/continuum managed post-commit/);

    writeFileSync(join(repo,"hooked.txt"),"hooked\n","utf8"); git(repo,"add","hooked.txt"); git(repo,"commit","-m","hook fallback");
    const pending=await new SqliteRuntimeStore(repo,()=>new Date().toISOString()).loadPendingReconcile(binding.workId);
    assert.ok(pending,"post-commit hook should wake Continuum");
    assert.deepEqual(pending?.changedFiles,["hooked.txt"]);
  }finally{rmSync(repo,{recursive:true,force:true});}
});


test("generic hook installation resolves the shared hooks directory from a linked worktree", async()=>{
  const repo=temp("continuum-p05-worktree-main-"); createRepo(repo);
  const linked=temp("continuum-p05-worktree-linked-"); rmSync(linked,{recursive:true,force:true});
  try{
    git(repo,"worktree","add","-q","-b","worker",linked);
    const port=new ShellGitPort();
    const hooks=await port.getHooksDirectory(linked);
    assert.ok(hooks.endsWith("/.git/hooks") || hooks.includes("/.git/hooks"),`unexpected hooks path: ${hooks}`);
    const app=createApp();
    const installed=await app.lifecycle.installGitHook(linked,"true");
    assert.ok(existsSync(installed.path));
    assert.equal(installed.path,join(hooks,"post-commit"));
  }finally{
    try{git(repo,"worktree","remove","--force",linked);}catch{}
    rmSync(repo,{recursive:true,force:true}); rmSync(linked,{recursive:true,force:true});
  }
});
