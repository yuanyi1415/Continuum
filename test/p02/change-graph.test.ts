import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/cli/composition-root.js";
import { assertChangeTransition } from "../../src/domain/change/change.js";
import { LocalGitArtifactAuthority } from "../../src/adapters/artifact/local-git-artifact-authority.js";
import { createRepo } from "../helpers/git.js";

process.env.CONTINUUM_DEV_FALLBACKS="1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";

function temp(prefix:string){ return mkdtempSync(join(tmpdir(),prefix)); }

test("change state machine only allows active terminal transitions",()=>{
  assert.doesNotThrow(()=>assertChangeTransition("active","closed"));
  assert.doesNotThrow(()=>assertChangeTransition("active","superseded"));
  assert.throws(()=>assertChangeTransition("closed","active"),/invalid change transition/);
  assert.throws(()=>assertChangeTransition("superseded","active"),/invalid change transition/);
  assert.throws(()=>assertChangeTransition("closed","superseded"),/invalid change transition/);
});

test("change, artifacts and typed relations form a durable project graph",async()=>{
  const repo=temp("continuum-p02-graph-"); createRepo(repo);
  try{
    const app=createApp(); await app.init.execute(repo,"P02 Fixture");
    mkdirSync(join(repo,"docs"),{recursive:true});
    writeFileSync(join(repo,"docs","spec.md"),"# User Memory Spec\n","utf8");
    writeFileSync(join(repo,"docs","p01.md"),"# P01\n","utf8");
    writeFileSync(join(repo,"CONTEXT.md"),"# Domain Context\n","utf8");
    writeFileSync(join(repo,"docs","old-spec.md"),"# Historical Spec\n","utf8");

    const change=await app.change.open.execute(repo,"用户 Memory","Add user-scoped memory");
    assert.equal(change.status,"active");

    const spec=(await app.artifact.register.execute(repo,{artifactId:"SPEC-001",type:"spec",authority:"git-file",locator:"docs/spec.md",title:"User Memory Spec"})).artifact;
    const ticket=(await app.artifact.register.execute(repo,{artifactId:"P01",type:"ticket",authority:"git-file",locator:"docs/p01.md",title:"Storage"})).artifact;
    const context=(await app.artifact.register.execute(repo,{artifactId:"CONTEXT",type:"context",authority:"git-file",locator:"CONTEXT.md"})).artifact;
    const old=(await app.artifact.register.execute(repo,{artifactId:"SPEC-OLD",type:"spec",authority:"git-file",locator:"docs/old-spec.md"})).artifact;

    assert.match(spec.version ?? "",/^[0-9a-f]{40}$/);
    assert.equal(Object.prototype.hasOwnProperty.call(spec,"content"),false);

    await app.relation.register.execute(repo,{from:spec.artifactId,to:change.changeId,type:"belongs_to",routing:"required"});
    await app.relation.register.execute(repo,{from:ticket.artifactId,to:change.changeId,type:"belongs_to",routing:"required"});
    await app.relation.register.execute(repo,{from:ticket.artifactId,to:spec.artifactId,type:"belongs_to",routing:"required"});
    await app.relation.register.execute(repo,{from:ticket.artifactId,to:context.artifactId,type:"domain_context",routing:"required"});
    await app.relation.register.execute(repo,{from:ticket.artifactId,to:old.artifactId,type:"governed_by",routing:"historical"});

    const duplicate=await app.relation.register.execute(repo,{from:ticket.artifactId,to:spec.artifactId,type:"belongs_to",routing:"required"});
    assert.equal(duplicate.created,false);

    const stored=await app.change.get.execute(repo,change.changeId);
    assert.deepEqual(stored.specRefs,["SPEC-001"]);
    assert.deepEqual(stored.ticketRefs,["P01"]);

    const active=await app.change.list.execute(repo,"active");
    assert.equal(active.length,1); assert.equal(active[0].changeId,change.changeId);
    const status=await app.status.execute(repo);
    assert.deepEqual(status.current.activeChanges,[change.changeId]);
    assert.equal(status.changes.active[0].title,"用户 Memory");

    const relations=await app.relation.list.execute(repo,"P01");
    assert.equal(relations.length,4);
    assert.equal(relations.filter(r=>r.routing==="historical").length,1);

    const changeDoc=readFileSync(join(repo,".continuum","changes",`change_${change.changeId}.yaml`),"utf8");
    const artifactDoc=readFileSync(join(repo,".continuum","artifacts","artifact_SPEC-001.yaml"),"utf8");
    assert.match(changeDoc,/用户 Memory/);
    assert.doesNotMatch(artifactDoc,/User Memory Spec\\n/);
  }finally{ rmSync(repo,{recursive:true,force:true}); }
});

test("artifact registration fails closed on conflicts, missing sources and path escape",async()=>{
  const repo=temp("continuum-p02-artifact-"); createRepo(repo);
  try{
    const app=createApp(); await app.init.execute(repo,"Artifact Fixture");
    writeFileSync(join(repo,"spec.md"),"# Spec\n","utf8");
    await app.artifact.register.execute(repo,{artifactId:"SPEC-1",type:"spec",authority:"git-file",locator:"spec.md"});
    const same=await app.artifact.register.execute(repo,{artifactId:"SPEC-1",type:"spec",authority:"git-file",locator:"spec.md"});
    assert.equal(same.created,false);
    await assert.rejects(()=>app.artifact.register.execute(repo,{artifactId:"SPEC-1",type:"ticket",authority:"git-file",locator:"spec.md"}),/different identity/);
    await assert.rejects(()=>app.artifact.register.execute(repo,{artifactId:"MISSING",type:"spec",authority:"git-file",locator:"missing.md"}),/does not exist/);
    const authority=new LocalGitArtifactAuthority(repo);
    await assert.rejects(()=>authority.resolve({schemaVersion:1,artifactId:"ESCAPE",type:"document",authority:"git-file",locator:"../outside.md"}),/escapes repository root/);
    await assert.rejects(()=>app.relation.register.execute(repo,{from:"SPEC-1",to:"UNKNOWN",type:"belongs_to"}),/target does not exist/);
  }finally{ rmSync(repo,{recursive:true,force:true}); }
});
