import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepo } from "../helpers/git.js";

process.env.CONTINUUM_DEV_FALLBACKS="1";
process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";
function temp(prefix:string){return mkdtempSync(join(tmpdir(),prefix));}
function cli(cwd:string,args:string[]){return JSON.parse(execFileSync(process.execPath,[join(process.cwd(),"dist-test/src/cli/index.js"),...args,"--json"],{cwd,encoding:"utf8",env:{...process.env,CONTINUUM_DEV_FALLBACKS:"1",CONTINUUM_DEV_ALLOW_NODE_SQLITE:"1"}}));}
function write(root:string,path:string,content:string){const full=join(root,path);mkdirSync(join(full,".."),{recursive:true});writeFileSync(full,content,"utf8");}

test("CLI scans Matt artifacts then routes context without scanning unrelated docs",()=>{
 const repo=temp("continuum-p04-cli-"); createRepo(repo);
 try{
  cli(repo,["init","--name","P04 CLI"]);
  const change=cli(repo,["change","open","用户 Memory"]).data;
  write(repo,"CONTEXT.md","# Context\n");
  write(repo,"docs/specs/SPEC-001.md","# Spec\n");
  write(repo,"docs/tickets/P03.md","# Ticket\n");
  write(repo,"docs/adrs/ADR-002.md","# ADR\n");
  write(repo,"docs/other/P99.md","# unrelated\n");
  const scan=cli(repo,["matt","scan","--change",change.changeId]);
  assert.deepEqual(scan.data.discovered.map((x:any)=>x.artifactId).sort(),["ADR-002","CONTEXT","P03","SPEC-001"]);
  cli(repo,["relation","add","P03","belongs_to","SPEC-001"]);
  cli(repo,["relation","add","P03","domain_context","CONTEXT"]);
  cli(repo,["relation","add","SPEC-001","governed_by","ADR-002"]);
  const manifest=cli(repo,["context","P03"]).data;
  assert.deepEqual(manifest.required.map((x:any)=>x.artifactId),["P03","CONTEXT","SPEC-001","ADR-002"]);
  assert.equal(manifest.required.some((x:any)=>x.artifactId==="P99"),false);
 } finally {rmSync(repo,{recursive:true,force:true});}
});
