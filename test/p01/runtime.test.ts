import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteRuntimeStore } from "../../src/adapters/storage/sqlite-runtime-store/sqlite-runtime-store.js";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";

test("runtime migration is idempotent and reports schema version", async()=>{
 const root=mkdtempSync(join(tmpdir(),"continuum-runtime-"));
 try { const store=new SqliteRuntimeStore(root,()=>new Date().toISOString()); await store.initialize(); await store.initialize(); const h=await store.health(); assert.equal(h.available,true); assert.equal(h.schemaVersion,2); }
 finally { rmSync(root,{recursive:true,force:true}); }
});
