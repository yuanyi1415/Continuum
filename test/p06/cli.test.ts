import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepo, git } from "../helpers/git.js";

process.env.CONTINUUM_DEV_FALLBACKS="1"; process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";
function temp(prefix:string){return mkdtempSync(join(tmpdir(),prefix));}
function cli(repo:string,...args:string[]):any{const out=execFileSync(process.execPath,[join(process.cwd(),"dist-test","src","cli","index.js"),...args,"--json"],{cwd:repo,encoding:"utf8",env:{...process.env,CONTINUUM_DEV_FALLBACKS:"1",CONTINUUM_DEV_ALLOW_NODE_SQLITE:"1"}});return JSON.parse(out);}

test("change close CLI fails closed when required Work evidence is absent",()=>{
  const repo=temp("continuum-p06-cli-"); createRepo(repo);
  try{
    cli(repo,"init","--name","P06 CLI"); mkdirSync(join(repo,"docs"),{recursive:true}); writeFileSync(join(repo,"docs","spec.md"),"# Spec\n"); writeFileSync(join(repo,"docs","p03.md"),"# P03\n");
    const change=cli(repo,"change","open","Memory").data;
    cli(repo,"artifact","register","docs/spec.md","--type","spec","--id","SPEC-001","--change",change.changeId);
    cli(repo,"artifact","register","docs/p03.md","--type","ticket","--id","P03","--change",change.changeId);
    git(repo,"add","."); git(repo,"commit","-m","prepare");
    const result=spawnSync(process.execPath,[join(process.cwd(),"dist-test","src","cli","index.js"),"change","close",change.changeId,"--json"],{cwd:repo,encoding:"utf8",env:{...process.env,CONTINUUM_DEV_FALLBACKS:"1",CONTINUUM_DEV_ALLOW_NODE_SQLITE:"1"}});
    assert.equal(result.status,2); const payload=JSON.parse(result.stdout); assert.equal(payload.ok,false); assert.equal(payload.error.code,"CONTINUUM_EVIDENCE_UNKNOWN");
  } finally {rmSync(repo,{recursive:true,force:true});}
});
