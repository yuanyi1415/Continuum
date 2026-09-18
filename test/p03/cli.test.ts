import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepo, git } from "../helpers/git.js";

function temp(prefix:string){ return mkdtempSync(join(tmpdir(),prefix)); }
function cli(repo:string,args:string[]):any{
  const path=join(process.cwd(),"dist-test","src","cli","index.js");
  const out=execFileSync(process.execPath,[path,...args,"--json"],{cwd:repo,encoding:"utf8",env:{...process.env,CONTINUUM_DEV_FALLBACKS:"1",CONTINUUM_DEV_ALLOW_NODE_SQLITE:"1"}});
  return JSON.parse(out);
}

test("P03 CLI binds, resumes and suppresses only the current session",()=>{
  const repo=temp("continuum-p03-cli-"); createRepo(repo);
  try{
    cli(repo,["init","--name","CLI P03"]);
    mkdirSync(join(repo,"docs"),{recursive:true}); writeFileSync(join(repo,"docs","p03.md"),"# P03\n");
    const change=cli(repo,["change","open","User Memory"]); const changeId=change.data.changeId;
    cli(repo,["artifact","register","docs/p03.md","--type","ticket","--id","P03","--change",changeId]);
    git(repo,"add","."); git(repo,"commit","-m","prepare p03"); const baseline=git(repo,"rev-parse","HEAD");

    const bound=cli(repo,["work","bind","P03","--session","codex-1","--host","codex"]);
    assert.equal(bound.data.binding.workStartRevision,baseline); assert.equal(bound.data.created,true);

    const resumed=cli(repo,["work","current","--session","omp-1","--host","omp"]);
    assert.equal(resumed.data.mode,"managed"); assert.equal(resumed.data.binding.targetArtifactId,"P03");

    cli(repo,["work","suppress-session","--session","omp-1","--host","omp","--reason","ad-hoc"]);
    const sameSession=cli(repo,["work","current","--session","omp-1","--host","omp"]);
    assert.equal(sameSession.data.mode,"aware"); assert.equal(sameSession.data.suppressed,true);

    const fresh=cli(repo,["work","current","--session","codex-2","--host","codex"]);
    assert.equal(fresh.data.mode,"managed"); assert.equal(fresh.data.binding.workStartRevision,baseline);

    const status=cli(repo,["status"]);
    assert.equal(status.data.work.mode,"managed"); assert.equal(status.data.work.binding.targetArtifactId,"P03");
  }finally{rmSync(repo,{recursive:true,force:true});}
});
