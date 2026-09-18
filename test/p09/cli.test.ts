import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepo } from "../helpers/git.js";

process.env.CONTINUUM_DEV_FALLBACKS="1"; process.env.CONTINUUM_DEV_ALLOW_NODE_SQLITE="1";
const CLI=join(process.cwd(),"dist-test","src","cli","index.js");
function temp(prefix:string){return mkdtempSync(join(tmpdir(),prefix));}
function cli(repo:string,...args:string[]):any{const out=execFileSync(process.execPath,[CLI,...args,"--json"],{cwd:repo,encoding:"utf8",env:{...process.env,CONTINUUM_DEV_FALLBACKS:"1",CONTINUUM_DEV_ALLOW_NODE_SQLITE:"1"}});return JSON.parse(out);}

test("P09 CLI exposes doctor recover, migrate, and host doctor machine output",()=>{
  const repo=temp("continuum-p09-cli-"); createRepo(repo);
  try{
    cli(repo,"init","--name","P09 CLI");
    const doctor=cli(repo,"doctor"); assert.equal(typeof doctor.data.recovered,"boolean");
    const migrate=cli(repo,"migrate"); assert.equal(migrate.data.runtime.toVersion,2);
    const hosts=cli(repo,"host","doctor"); assert.equal(Array.isArray(hosts.data),true);
  } finally {rmSync(repo,{recursive:true,force:true});}
});
