import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/cli/composition-root.js";
import { createRepo } from "../helpers/git.js";

process.env.CONTINUUM_DEV_FALLBACKS="1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";

function temp(prefix:string){ return mkdtempSync(join(tmpdir(),prefix)); }
function write(root:string,path:string,content:string){ const full=join(root,path); mkdirSync(join(full,".."),{recursive:true}); writeFileSync(full,content,"utf8"); }

test("Matt observer registers only bounded conventional artifacts and safely links spec/ticket to explicit change",async()=>{
  const repo=temp("continuum-p04-matt-"); createRepo(repo);
  try{
    const app=createApp(); await app.init.execute(repo,"P04 Matt Fixture");
    write(repo,"CONTEXT.md","# Project Context\n");
    write(repo,"docs/specs/SPEC-001-user-memory.md","# User Memory Spec\n");
    write(repo,"docs/tickets/P03-runtime-read.md","# Runtime Read\n");
    write(repo,"docs/adrs/ADR-002-memory-boundary.md","# Memory Boundary\n");
    write(repo,"docs/random/SPEC-999-should-not-be-scanned.md","# Not Matt bounded root\n");
    const change=await app.change.open.execute(repo,"用户 Memory");
    const result=await app.matt.scan.execute(repo,change.changeId);
    assert.deepEqual(result.discovered.map(x=>x.artifactId).sort(),["ADR-002","CONTEXT","P03","SPEC-001"]);
    assert.deepEqual(result.linkedToChange.sort(),["P03","SPEC-001"]);
    const artifacts=await app.artifact.list.execute(repo);
    assert.equal(artifacts.some(a=>a.artifactId==="SPEC-999"),false);
    const stored=await app.change.get.execute(repo,change.changeId);
    assert.deepEqual(stored.specRefs,["SPEC-001"]);
    assert.deepEqual(stored.ticketRefs,["P03"]);
    const again=await app.matt.scan.execute(repo,change.changeId);
    assert.equal(again.registered.length,0);
    assert.deepEqual(again.existing.sort(),["ADR-002","CONTEXT","P03","SPEC-001"]);
  }finally{ rmSync(repo,{recursive:true,force:true}); }
});

test("Matt observer fails on duplicate inferred ids instead of choosing an arbitrary file",async()=>{
  const repo=temp("continuum-p04-matt-conflict-"); createRepo(repo);
  try{
    const app=createApp(); await app.init.execute(repo,"P04 Matt Conflict");
    write(repo,"docs/specs/SPEC-001-a.md","# A\n");
    write(repo,"specs/SPEC-001-b.md","# B\n");
    await assert.rejects(()=>app.matt.scan.execute(repo),/Matt artifact id conflict/);
  }finally{rmSync(repo,{recursive:true,force:true});}
});

test("context router returns minimal required graph, optional candidates, and excludes historical",async()=>{
  const repo=temp("continuum-p04-context-"); createRepo(repo);
  try{
    const app=createApp(); await app.init.execute(repo,"P04 Context Fixture");
    write(repo,"docs/specs/SPEC-001-user-memory.md","# User Memory Spec\nSPEC BODY\n");
    write(repo,"docs/tickets/P03-runtime-read.md","# Runtime Read\nTICKET BODY\n");
    write(repo,"CONTEXT.md","# Project Context\nDOMAIN BODY\n");
    write(repo,"docs/adrs/ADR-002-memory-boundary.md","# Memory Boundary\nADR BODY\n");
    write(repo,"docs/specs/SPEC-OLD.md","# Old Spec\nOLD BODY\n");
    write(repo,"docs/evidence.md","# Optional Evidence\nEVIDENCE BODY\n");
    write(repo,"docs/unrelated.md","# Unrelated\nSHOULD NOT LOAD\n");
    write(repo,"docs/tickets/P04-sibling.md","# Sibling Ticket\nSHOULD NOT LOAD\n");
    const change=await app.change.open.execute(repo,"用户 Memory");
    for(const [id,type,locator] of [
      ["SPEC-001","spec","docs/specs/SPEC-001-user-memory.md"],
      ["P03","ticket","docs/tickets/P03-runtime-read.md"],
      ["CONTEXT","context","CONTEXT.md"],
      ["ADR-002","adr","docs/adrs/ADR-002-memory-boundary.md"],
      ["SPEC-OLD","spec","docs/specs/SPEC-OLD.md"],
      ["EVIDENCE-1","evidence","docs/evidence.md"],
      ["UNRELATED","document","docs/unrelated.md"],
      ["P04","ticket","docs/tickets/P04-sibling.md"],
    ] as const){ await app.artifact.register.execute(repo,{artifactId:id,type,authority:"git-file",locator}); }
    await app.relation.register.execute(repo,{from:"SPEC-001",to:change.changeId,type:"belongs_to",routing:"required"});
    await app.relation.register.execute(repo,{from:"P03",to:change.changeId,type:"belongs_to",routing:"required"});
    await app.relation.register.execute(repo,{from:"P03",to:"SPEC-001",type:"belongs_to",routing:"required"});
    await app.relation.register.execute(repo,{from:"P04",to:"SPEC-001",type:"belongs_to",routing:"required"});
    await app.relation.register.execute(repo,{from:"P03",to:"CONTEXT",type:"domain_context",routing:"required"});
    await app.relation.register.execute(repo,{from:"SPEC-001",to:"ADR-002",type:"governed_by",routing:"required"});
    await app.relation.register.execute(repo,{from:"P03",to:"SPEC-OLD",type:"governed_by",routing:"historical"});
    await app.relation.register.execute(repo,{from:"P03",to:"EVIDENCE-1",type:"evidence",routing:"optional"});

    const manifest=await app.context.route.execute(repo,"P03");
    assert.deepEqual(manifest.required.map(x=>x.artifactId),["P03","CONTEXT","SPEC-001","ADR-002"]);
    assert.deepEqual(manifest.optional.map(x=>x.artifactId),["EVIDENCE-1"]);
    assert.deepEqual(manifest.excludedHistorical,["SPEC-OLD"]);
    assert.equal(manifest.required.some(x=>x.artifactId==="UNRELATED"),false);
    assert.equal(manifest.required.some(x=>x.artifactId==="P04"),false);
    assert.equal(manifest.required.find(x=>x.artifactId==="P03")?.reason,"current work");
    assert.equal(manifest.required.find(x=>x.artifactId==="ADR-002")?.reason,"governing ADR");
  }finally{ rmSync(repo,{recursive:true,force:true}); }
});

test("context budget is soft and never silently drops required authority",async()=>{
  const repo=temp("continuum-p04-budget-"); createRepo(repo);
  try{
    const app=createApp(); await app.init.execute(repo,"P04 Budget Fixture");
    write(repo,"docs/tickets/P03.md","# P03\n"+"x".repeat(200));
    write(repo,"CONTEXT.md","# Context\n"+"y".repeat(200));
    await app.artifact.register.execute(repo,{artifactId:"P03",type:"ticket",authority:"git-file",locator:"docs/tickets/P03.md"});
    await app.artifact.register.execute(repo,{artifactId:"CONTEXT",type:"context",authority:"git-file",locator:"CONTEXT.md"});
    await app.relation.register.execute(repo,{from:"P03",to:"CONTEXT",type:"domain_context",routing:"required"});
    const manifest=await app.context.route.execute(repo,"P03",{maxItems:1,maxTotalChars:10});
    assert.deepEqual(manifest.required.map(x=>x.artifactId),["P03","CONTEXT"]);
    assert.equal(manifest.warnings.length,2);
  }finally{ rmSync(repo,{recursive:true,force:true}); }
});
