import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepo } from "../helpers/git.js";

function temp(prefix:string){ return mkdtempSync(join(tmpdir(),prefix)); }
function cli(repo:string,args:string[]):any{
  const path=join(process.cwd(),"dist-test","src","cli","index.js");
  const out=execFileSync(process.execPath,[path,...args,"--json"],{cwd:repo,encoding:"utf8",env:{...process.env,CONTINUUM_DEV_FALLBACKS:"1",CONTINUUM_DEV_ALLOW_NODE_SQLITE:"1"}});
  return JSON.parse(out);
}

test("P02 CLI opens change, registers artifacts and relations, then exposes active graph",()=>{
  const repo=temp("continuum-p02-cli-"); createRepo(repo);
  try{
    cli(repo,["init","--name","CLI Fixture"]);
    mkdirSync(join(repo,"docs"),{recursive:true}); writeFileSync(join(repo,"docs","spec.md"),"# Spec\n"); writeFileSync(join(repo,"docs","p03.md"),"# P03\n");
    const opened=cli(repo,["change","open","用户 Memory","--intent","Memory capability"]); const changeId=opened.data.changeId;
    cli(repo,["artifact","register","docs/spec.md","--type","spec","--id","SPEC-001","--change",changeId]);
    cli(repo,["artifact","register","docs/p03.md","--type","ticket","--id","P03","--change",changeId]);
    cli(repo,["relation","add","P03","belongs_to","SPEC-001"]);

    const status=cli(repo,["status"]); assert.deepEqual(status.data.current.activeChanges,[changeId]);
    const change=cli(repo,["change","show",changeId]); assert.deepEqual(change.data.specRefs,["SPEC-001"]); assert.deepEqual(change.data.ticketRefs,["P03"]);
    const rels=cli(repo,["relation","list","--for","P03"]); assert.equal(rels.data.length,2);
  }finally{rmSync(repo,{recursive:true,force:true});}
});
