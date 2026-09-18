import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createApp } from "../../src/cli/composition-root.js";
import { createRepo, git } from "../helpers/git.js";

process.env.CONTINUUM_DEV_FALLBACKS = "1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE = "1";

function temp(prefix:string){ return mkdtempSync(join(tmpdir(), prefix)); }

test("init creates durable state, local runtime state and gitignore", async () => {
  const repo=temp("continuum-p01-"); createRepo(repo, "https://example.com/acme/project.git");
  try {
    const app=createApp(); const result=await app.init.execute(repo, "Fixture");
    assert.ok(existsSync(join(repo,".continuum","project.yaml")));
    assert.ok(existsSync(join(repo,".continuum","current.yaml")));
    assert.ok(existsSync(join(repo,".continuum","snapshots",`${result.snapshot.snapshotId}.yaml`)));
    assert.ok(existsSync(join(repo,".continuum-local","runtime.db")));
    assert.match(readFileSync(join(repo,".gitignore"),"utf8"), /^\.continuum-local\/$/m);
    assert.equal(git(repo,"check-ignore",".continuum-local/runtime.db"), ".continuum-local/runtime.db");
    const status=await app.status.execute(repo);
    assert.equal(status.project.repositoryIdentity,"https://example.com/acme/project.git");
    assert.equal(status.runtime.available,true);
  } finally { rmSync(repo,{recursive:true,force:true}); }
});

test("portable durable state survives clone without old runtime db", async () => {
  const base=temp("continuum-portable-"); const source=join(base,"source"); const clone=join(base,"clone"); createRepo(source);
  try {
    const app=createApp(); const init=await app.init.execute(source,"Portable"); const identity=init.project.repository.identity;
    git(source,"add",".continuum",".gitignore"); git(source,"commit","-m","initialize continuum");
    execFileSync("git",["clone",source,clone],{encoding:"utf8"});
    assert.equal(existsSync(join(clone,".continuum-local")),false);
    const clonedStatus=await createApp().status.execute(clone);
    assert.equal(clonedStatus.project.repositoryIdentity,identity);
    assert.equal(clonedStatus.current.snapshotId,init.snapshot.snapshotId);
    assert.equal(clonedStatus.runtime.available,false);
  } finally { rmSync(base,{recursive:true,force:true}); }
});

test("malformed durable state fails closed", async () => {
  const repo=temp("continuum-malformed-"); createRepo(repo);
  try {
    const app=createApp(); await app.init.execute(repo,"Broken");
    writeFileSync(join(repo,".continuum","project.yaml"),'{"schema_version":1,"project_id":"bad"}',"utf8");
    await assert.rejects(()=>createApp().status.execute(repo), /schema|missing|required|project/i);
  } finally { rmSync(repo,{recursive:true,force:true}); }
});

test("repository identity does not depend on clone path when no origin existed at init", async () => {
  const base=temp("continuum-identity-"); const source=join(base,"source"); const clone=join(base,"some-other-name"); createRepo(source);
  try {
    const init=await createApp().init.execute(source,"Identity");
    assert.match(init.project.repository.identity,/^git-local:[0-9a-f]{40,64}$/);
    git(source,"add",".continuum",".gitignore"); git(source,"commit","-m","continuum");
    execFileSync("git",["clone",source,clone],{encoding:"utf8"});
    const status=await createApp().status.execute(clone);
    assert.equal(status.project.repositoryIdentity,init.project.repository.identity);
  } finally { rmSync(base,{recursive:true,force:true}); }
});
