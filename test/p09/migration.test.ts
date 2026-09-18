import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createRepo } from "../helpers/git.js";
import { createApp } from "../../src/cli/composition-root.js";
import { SqliteRuntimeStore } from "../../src/adapters/storage/sqlite-runtime-store/sqlite-runtime-store.js";
import { MIGRATION_001 } from "../../src/adapters/storage/sqlite-runtime-store/migration-sql.js";

process.env.CONTINUUM_DEV_FALLBACKS="1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";
function temp(prefix:string){return mkdtempSync(join(tmpdir(),prefix));}

test("durable v0 marker migrates explicitly with backup and is idempotent",async()=>{
  const repo=temp("continuum-p09-durable-migrate-"); createRepo(repo);
  try{
    const app=createApp(); await app.init.execute(repo,"P09 migrate");
    const projectPath=join(repo,".continuum","project.yaml");
    writeFileSync(projectPath,readFileSync(projectPath,"utf8").replace("schema_version: 1","schema_version: 0"));
    const before=await app.doctor.execute(repo);
    assert.equal(before.ok,false);
    assert.equal(before.checks.find(c=>c.name==="durable-schema")?.recoverable,true);
    const migrated=await app.migrate.execute(repo);
    assert.deepEqual(migrated.durable.fromVersions,[0]);
    assert.deepEqual(migrated.durable.migratedFiles,[".continuum/project.yaml"]);
    assert.ok(migrated.durable.backupDirectory && existsSync(migrated.durable.backupDirectory));
    assert.match(readFileSync(projectPath,"utf8"),/schema_version: 1/);
    const again=await app.migrate.execute(repo);
    assert.deepEqual(again.durable.migratedFiles,[]);
  } finally {rmSync(repo,{recursive:true,force:true});}
});

test("durable schema newer than CLI fails closed",async()=>{
  const repo=temp("continuum-p09-durable-newer-"); createRepo(repo);
  try{
    const app=createApp(); await app.init.execute(repo,"P09 newer");
    const projectPath=join(repo,".continuum","project.yaml");
    writeFileSync(projectPath,readFileSync(projectPath,"utf8").replace("schema_version: 1","schema_version: 99"));
    const doctor=await app.doctor.execute(repo);
    assert.equal(doctor.ok,false);
    assert.equal(doctor.checks.find(c=>c.name==="durable-schema")?.code,"CONTINUUM_SCHEMA_TOO_NEW");
    await assert.rejects(app.migrate.execute(repo),(error:any)=>error?.code==="CONTINUUM_SCHEMA_TOO_NEW");
  } finally {rmSync(repo,{recursive:true,force:true});}
});

test("runtime schema v1 migrates transactionally to v2",async()=>{
  const repo=temp("continuum-p09-runtime-migrate-");
  try{
    mkdirSync(join(repo,".continuum-local"),{recursive:true});
    const path=join(repo,".continuum-local","runtime.db");
    const db=new DatabaseSync(path);
    try { db.exec(MIGRATION_001); db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)").run(new Date().toISOString()); }
    finally { db.close(); }
    const store=new SqliteRuntimeStore(repo,()=>new Date().toISOString());
    const before=await store.health(); assert.equal(before.state,"needs-migration"); assert.equal(before.schemaVersion,1);
    const result=await store.migrate(); assert.deepEqual(result.applied,[2]); assert.equal(result.toVersion,2);
    const after=await store.health(); assert.equal(after.state,"healthy"); assert.equal(after.schemaVersion,2);
    const again=await store.migrate(); assert.deepEqual(again.applied,[]);
  } finally {rmSync(repo,{recursive:true,force:true});}
});


test("runtime schema newer than CLI is never recovered or overwritten",async()=>{
  const repo=temp("continuum-p09-runtime-newer-");
  try{
    mkdirSync(join(repo,".continuum-local"),{recursive:true});
    const path=join(repo,".continuum-local","runtime.db");
    const db=new DatabaseSync(path);
    try { db.exec(MIGRATION_001); db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (99, ?)").run(new Date().toISOString()); }
    finally { db.close(); }
    const store=new SqliteRuntimeStore(repo,()=>new Date().toISOString());
    const health=await store.health(); assert.equal(health.state,"too-new"); assert.equal(health.schemaVersion,99);
    await assert.rejects(store.recover(),(error:any)=>error?.code==="CONTINUUM_SCHEMA_TOO_NEW");
  } finally {rmSync(repo,{recursive:true,force:true});}
});
