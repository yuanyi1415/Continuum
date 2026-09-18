import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { createApp } from "../../src/cli/composition-root.js";
import { SqliteRuntimeStore } from "../../src/adapters/storage/sqlite-runtime-store/sqlite-runtime-store.js";
import { YamlProjectStore } from "../../src/adapters/storage/yaml-project-store/yaml-project-store.js";
import { ContinuumError } from "../../src/shared/errors/continuum-error.js";
import type { ArtifactRef } from "../../src/domain/artifact/artifact-ref.js";
import { createRepo, git } from "../helpers/git.js";

process.env.CONTINUUM_DEV_FALLBACKS="1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";
function temp(prefix:string){ return mkdtempSync(join(tmpdir(),prefix)); }
const passFact={status:"PASS" as const,source:"p10-fixture"};

async function completedProject(prefix:string){
  const repo=temp(prefix); createRepo(repo); const app=createApp(); await app.init.execute(repo,"P10 Fixture");
  mkdirSync(join(repo,"docs"),{recursive:true}); mkdirSync(join(repo,"src"),{recursive:true});
  writeFileSync(join(repo,"docs","spec.md"),"# Spec\n\nFinal design.\n","utf8");
  writeFileSync(join(repo,"docs","p03.md"),"# P03\n","utf8");
  writeFileSync(join(repo,"docs","context.md"),"# CONTEXT\n\nProject context.\n","utf8");
  writeFileSync(join(repo,"docs","adr.md"),"# ADR\n\nDecision.\n","utf8");
  writeFileSync(join(repo,"docs","evidence.md"),"# Evidence\n\nReviewed.\n","utf8");
  const change=await app.change.open.execute(repo,"Archive ready change");
  for(const item of [
    {artifactId:"SPEC-001",type:"spec" as const,locator:"docs/spec.md"},
    {artifactId:"P03",type:"ticket" as const,locator:"docs/p03.md"},
    {artifactId:"CTX-001",type:"context" as const,locator:"docs/context.md"},
    {artifactId:"ADR-001",type:"adr" as const,locator:"docs/adr.md"},
    {artifactId:"EVID-001",type:"evidence" as const,locator:"docs/evidence.md"},
  ]) await app.artifact.register.execute(repo,{...item,authority:"git-file",title:item.artifactId});
  await app.relation.register.execute(repo,{from:"SPEC-001",to:change.changeId,type:"belongs_to",routing:"required"});
  await app.relation.register.execute(repo,{from:"P03",to:change.changeId,type:"belongs_to",routing:"required"});
  await app.relation.register.execute(repo,{from:"P03",to:"CTX-001",type:"domain_context",routing:"required"});
  await app.relation.register.execute(repo,{from:"P03",to:"ADR-001",type:"governed_by",routing:"required"});
  await app.relation.register.execute(repo,{from:"P03",to:"EVID-001",type:"evidence",routing:"required"});
  git(repo,"add","."); git(repo,"commit","-m","prepare archive authorities"); const base=git(repo,"rev-parse","HEAD");
  writeFileSync(join(repo,"src","impl.ts"),"export const ready = true;\n","utf8"); git(repo,"add","src/impl.ts"); git(repo,"commit","-m","implement P03"); const finalRevision=git(repo,"rev-parse","HEAD");
  const facts=(await app.work.bind.execute(repo,{targetArtifactId:"P03",bindingSource:"p10-fixture"})).binding;
  const runtime=new SqliteRuntimeStore(repo,()=>new Date().toISOString()); await runtime.initialize();
  await runtime.savePendingReconcile({workId:facts.workId,baseRevision:base,currentRevision:finalRevision,changedFiles:["src/impl.ts"],evidence:{tests:passFact,review:passFact,completion:passFact},knowledgeImpact:"N0",actions:["AUTO"],updatedAt:new Date().toISOString()});
  const closed=await app.reconcile.change.execute(repo,change.changeId);
  assert.equal(closed.status,"CLOSED");
  return {repo,app,change,finalRevision,finalSnapshot:closed.snapshot.snapshotId};
}

function readManifest(path:string):any { return YAML.parse(readFileSync(join(path,"manifest.yaml"),"utf8")); }

test("archive materializes final state, authorities and exact final source snapshot",async()=>{
  const {repo,app,finalRevision,finalSnapshot}=await completedProject("continuum-p10-create-");
  try{
    // A later commit must not change what the final Snapshot archives.
    writeFileSync(join(repo,"src","impl.ts"),"export const ready = 'later';\n","utf8");
    writeFileSync(join(repo,"docs","spec.md"),"# Spec\n\nLater unmanaged edit.\n","utf8");
    git(repo,"add","src/impl.ts","docs/spec.md"); git(repo,"commit","-m","post-project unrelated change");

    const result=await app.archive.create.execute(repo);
    assert.equal(result.manifest.status,"complete"); assert.equal(result.manifest.finalSnapshot,finalSnapshot); assert.equal(result.manifest.repository.revision,finalRevision);
    assert.equal(readFileSync(join(result.archivePath,"source","snapshot","src","impl.ts"),"utf8"),"export const ready = true;\n");
    const specEntry=result.manifest.artifacts.find(item=>item.artifactId==="SPEC-001");
    assert.equal(specEntry?.status,"materialized"); assert.ok(specEntry?.materializedPath);
    assert.equal(readFileSync(join(result.archivePath,specEntry!.materializedPath!),"utf8"),"# Spec\n\nFinal design.\n");
    assert.ok(existsSync(join(result.archivePath,"continuum","current.yaml")));
    assert.ok(existsSync(join(result.archivePath,"continuum","reconciles")));
    assert.ok(existsSync(join(result.archivePath,"checksums.sha256")));
    assert.equal((await app.archive.verify.execute(result.archivePath)).ok,true);
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("archive remains readable and verifiable after original repository is removed",async()=>{
  const {repo,app}=await completedProject("continuum-p10-independent-"); const outside=temp("continuum-p10-copy-");
  try{
    const result=await app.archive.create.execute(repo);
    const standalone=join(outside,"standalone-archive");
    renameSync(result.archivePath,standalone);
    rmSync(repo,{recursive:true,force:true});
    const verify=await app.archive.verify.execute(standalone);
    assert.equal(verify.ok,true); assert.ok(readManifest(standalone).project.id.startsWith("prj_"));
    assert.ok(existsSync(join(standalone,"source","snapshot","README.md")));
  }finally{rmSync(repo,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});}
});

test("missing required authority fails closed unless allow-incomplete is explicit",async()=>{
  const {repo,app}=await completedProject("continuum-p10-incomplete-");
  try{
    const store=new YamlProjectStore(repo);
    const missing:ArtifactRef={schemaVersion:1,artifactId:"SPEC-MISSING",type:"spec",authority:"git-file",locator:"docs/never-existed.md",title:"Missing Spec"};
    await store.saveArtifact(missing);
    await assert.rejects(()=>app.archive.create.execute(repo),(error:any)=>error instanceof ContinuumError && error.code==="CONTINUUM_ARCHIVE_INCOMPLETE");
    const result=await app.archive.create.execute(repo,{allowIncomplete:true});
    assert.equal(result.manifest.status,"incomplete");
    assert.equal(result.manifest.artifacts.find(item=>item.artifactId==="SPEC-MISSING")?.status,"missing");
    assert.ok(result.manifest.missingOrExternal.includes("SPEC-MISSING"));
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("archive refuses a project with an active Change",async()=>{
  const repo=temp("continuum-p10-active-"); createRepo(repo); const app=createApp();
  try{
    await app.init.execute(repo,"Active"); await app.change.open.execute(repo,"Still active");
    await assert.rejects(()=>app.archive.create.execute(repo),(error:any)=>error instanceof ContinuumError && error.code==="CONTINUUM_ARCHIVE_NOT_READY");
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("with-history creates a Git bundle that can restore a repository",async()=>{
  const {repo,app,finalRevision}=await completedProject("continuum-p10-history-"); const restore=temp("continuum-p10-restore-parent-");
  try{
    const result=await app.archive.create.execute(repo,{withHistory:true});
    const bundle=join(result.archivePath,"source","history.bundle"); assert.ok(existsSync(bundle));
    const restored=join(restore,"repo"); git(restore,"clone",bundle,restored);
    assert.equal(git(restored,"cat-file","-t",finalRevision),"commit");
  }finally{rmSync(repo,{recursive:true,force:true});rmSync(restore,{recursive:true,force:true});}
});

test("archive verification detects tampering",async()=>{
  const {repo,app}=await completedProject("continuum-p10-tamper-");
  try{
    const result=await app.archive.create.execute(repo);
    writeFileSync(join(result.archivePath,"artifacts","spec","SPEC-001.md"),"tampered\n","utf8");
    const verify=await app.archive.verify.execute(result.archivePath);
    assert.equal(verify.ok,false); assert.ok(verify.failures.some(item=>item.includes("Checksum mismatch")));
  }finally{rmSync(repo,{recursive:true,force:true});}
});
