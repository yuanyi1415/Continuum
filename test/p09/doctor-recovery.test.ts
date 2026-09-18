import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepo, git } from "../helpers/git.js";
import { createApp } from "../../src/cli/composition-root.js";
import { SqliteRuntimeStore } from "../../src/adapters/storage/sqlite-runtime-store/sqlite-runtime-store.js";

process.env.CONTINUUM_DEV_FALLBACKS="1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";
function temp(prefix:string){return mkdtempSync(join(tmpdir(),prefix));}
function removeRuntime(repo:string){ for(const name of ["runtime.db","runtime.db-wal","runtime.db-shm"]) try{unlinkSync(join(repo,".continuum-local",name));}catch{} }

async function preparedManagedRepo(prefix:string){
  const repo=temp(prefix); createRepo(repo); const app=createApp(); await app.init.execute(repo,"P09 managed");
  mkdirSync(join(repo,"docs"),{recursive:true}); writeFileSync(join(repo,"docs","p03.md"),"# P03\n");
  const change=await app.change.open.execute(repo,"Recovery");
  await app.artifact.register.execute(repo,{artifactId:"P03",type:"ticket",authority:"git-file",locator:"docs/p03.md",title:"P03"});
  await app.relation.register.execute(repo,{from:"P03",to:change.changeId,type:"belongs_to",routing:"required"});
  git(repo,"add","."); git(repo,"commit","-m","prepare P03");
  await app.work.bind.execute(repo,{targetArtifactId:"P03",bindingSource:"test"});
  return {repo,app,change};
}

test("missing runtime.db is recreated without guessing lost Work ownership",async()=>{
  const {repo,app}=await preparedManagedRepo("continuum-p09-runtime-missing-");
  try{
    writeFileSync(join(repo,"implementation.ts"),"export const x = 1;\n"); git(repo,"add","implementation.ts"); git(repo,"commit","-m","business change");
    removeRuntime(repo);
    const before=await app.doctor.execute(repo); assert.equal(before.checks.find(c=>c.name==="runtime")?.level,"WARN");
    const result=await app.doctor.execute(repo,{recover:true});
    assert.equal(result.recovered,true);
    assert.equal(result.checks.find(c=>c.name==="runtime-recovery")?.repaired,true);
    assert.equal(result.checks.find(c=>c.name==="runtime")?.level,"PASS");
    const delta=result.checks.find(c=>c.name==="unreconciled-git"); assert.equal(delta?.level,"WARN"); assert.match(delta?.message??"",/will not guess a Work owner/);
    const runtime=new SqliteRuntimeStore(repo,()=>new Date().toISOString()); assert.equal((await runtime.health()).schemaVersion,2);
    assert.equal((await runtime.listWorktreeBindings()).length,0);
  } finally {rmSync(repo,{recursive:true,force:true});}
});

test("corrupt runtime.db is quarantined and rebuilt instead of deleted",async()=>{
  const {repo,app}=await preparedManagedRepo("continuum-p09-runtime-corrupt-");
  try{
    removeRuntime(repo); mkdirSync(join(repo,".continuum-local"),{recursive:true}); writeFileSync(join(repo,".continuum-local","runtime.db"),Buffer.from("not a sqlite database"));
    const before=await app.doctor.execute(repo); assert.equal(before.checks.find(c=>c.name==="runtime")?.code,"CONTINUUM_RUNTIME_CORRUPT");
    const recovered=await app.doctor.execute(repo,{recover:true});
    const repair=recovered.checks.find(c=>c.name==="runtime-recovery"); assert.equal(repair?.repaired,true); assert.match(repair?.message??"",/quarantined and rebuilt/);
    const quarantined=readdirSync(join(repo,".continuum-local")).filter(name=>name.startsWith("runtime.db.corrupt-")); assert.equal(quarantined.length,1);
    assert.ok(existsSync(join(repo,".continuum-local",quarantined[0])));
    const runtime=new SqliteRuntimeStore(repo,()=>new Date().toISOString()); assert.equal((await runtime.health()).state,"healthy");
  } finally {rmSync(repo,{recursive:true,force:true});}
});

test("lost hook is recovered from Work Binding plus Git state",async()=>{
  const {repo,app}=await preparedManagedRepo("continuum-p09-lost-hook-");
  try{
    writeFileSync(join(repo,"implementation.ts"),"export const recovered = true;\n"); git(repo,"add","implementation.ts"); git(repo,"commit","-m","implementation without hook");
    const before=await app.doctor.execute(repo); assert.equal(before.checks.find(c=>c.name==="pending-work")?.level,"WARN");
    const result=await app.doctor.execute(repo,{recover:true});
    const pending=result.checks.find(c=>c.name==="pending-work"); assert.equal(pending?.level,"PASS"); assert.equal(pending?.repaired,true);
    const runtime=new SqliteRuntimeStore(repo,()=>new Date().toISOString()); assert.equal((await runtime.listPendingReconciles()).length,1);
  } finally {rmSync(repo,{recursive:true,force:true});}
});

test("broken Current pointer is reported and never guessed",async()=>{
  const repo=temp("continuum-p09-current-broken-"); createRepo(repo);
  try{
    const app=createApp(); await app.init.execute(repo,"P09 current");
    const current=join(repo,".continuum","current.yaml"); writeFileSync(current,readFileSync(current,"utf8").replace(/snapshot_id: .+/,"snapshot_id: snap_missing"));
    const result=await app.doctor.execute(repo,{recover:true});
    assert.equal(result.ok,false);
    const check=result.checks.find(c=>c.name==="durable"||c.name==="current-pointer"); assert.ok(check); assert.equal(check?.level,"FAIL"); assert.match(check?.message??"",/snap_missing|Required Continuum state is missing/);
    assert.equal(result.checks.some(c=>c.repaired&&c.name==="current-pointer"),false);
  } finally {rmSync(repo,{recursive:true,force:true});}
});

test("missing Artifact authority and orphan Relation are explicit authority failures",async()=>{
  const repo=temp("continuum-p09-authority-"); createRepo(repo);
  try{
    const app=createApp(); await app.init.execute(repo,"P09 authority"); mkdirSync(join(repo,"docs"),{recursive:true}); writeFileSync(join(repo,"docs","spec.md"),"# Spec\n"); writeFileSync(join(repo,"docs","p03.md"),"# P03\n");
    const change=await app.change.open.execute(repo,"Authority");
    await app.artifact.register.execute(repo,{artifactId:"SPEC-001",type:"spec",authority:"git-file",locator:"docs/spec.md"});
    await app.artifact.register.execute(repo,{artifactId:"P03",type:"ticket",authority:"git-file",locator:"docs/p03.md"});
    const rel=await app.relation.register.execute(repo,{from:"SPEC-001",to:change.changeId,type:"belongs_to",routing:"required"});
    unlinkSync(join(repo,"docs","spec.md"));
    const relPath=join(repo,".continuum","relations",`${rel.relation.relationId}.yaml`); writeFileSync(relPath,readFileSync(relPath,"utf8").replace(`to: ${change.changeId}`,"to: MISSING-NODE"));
    const result=await app.doctor.execute(repo);
    assert.equal(result.ok,false);
    assert.equal(result.checks.find(c=>c.name==="artifact-authority")?.code,"CONTINUUM_AUTHORITY_UNAVAILABLE");
    assert.equal(result.checks.find(c=>c.name==="artifact-graph")?.code,"CONTINUUM_AUTHORITY_UNAVAILABLE");
  } finally {rmSync(repo,{recursive:true,force:true});}
});
