import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepositoryHostDiagnostics } from "../../src/adapters/hosts/repository-host-diagnostics.js";

function temp(prefix:string){return mkdtempSync(join(tmpdir(),prefix));}

test("host diagnostics detect repository adapter drift independently of host runtime",async()=>{
  const repo=temp("continuum-p09-host-");
  try{
    const asset=join(repo,"asset.ts"); writeFileSync(asset,"export const current = true;\n");
    mkdirSync(join(repo,".omp","extensions"),{recursive:true}); writeFileSync(join(repo,".omp","extensions","continuum.ts"),"// stale\n");
    const detectCodex=async()=>({installed:true,version:"codex-test",lifecycleHooks:true,structuredDecision:true,blockingUi:true,ambientStatus:false as const,headless:false,diagnostics:[]});
    const detectOmp=async()=>({installed:true,version:"omp-test",lifecycleHooks:true,projectExtensions:true,ambientWidget:true,structuredDecision:true,blockingUi:true,headless:true,diagnostics:[]});
    const result=await new RepositoryHostDiagnostics(repo,asset,detectCodex,detectOmp).inspect();
    assert.equal(result.find(r=>r.host==="codex")?.level,"WARN");
    const omp=result.find(r=>r.host==="omp"); assert.equal(omp?.level,"WARN"); assert.equal(omp?.adapterCurrent,false);
  } finally {rmSync(repo,{recursive:true,force:true});}
});
