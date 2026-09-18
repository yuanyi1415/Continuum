import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexGlobalInstaller } from "../../src/adapters/hosts/codex/codex-global-installer.js";
import { OmpGlobalInstaller } from "../../src/adapters/hosts/omp/omp-global-installer.js";
import { UserHostDiagnostics } from "../../src/adapters/hosts/user-host-diagnostics.js";
import { findContinuumProjectRoot } from "../../src/adapters/project/continuum-project-locator.js";

function temp(prefix:string){return mkdtempSync(join(tmpdir(),prefix));}
const CLI=join(process.cwd(),"dist-test","src","cli","index.js");

function fakeCodexCaps(){return {installed:true,version:"codex-test",lifecycleHooks:true,structuredDecision:true,blockingUi:true,ambientStatus:false as const,headless:false,diagnostics:[]};}
function fakeOmpCaps(){return {installed:true,version:"omp-test",lifecycleHooks:true,projectExtensions:true,ambientWidget:true,structuredDecision:true,blockingUi:true,headless:true,diagnostics:[]};}

test("Continuum project discovery is opt-in and walks up from nested cwd",()=>{
  const root=temp("continuum-p11-locator-");
  try{
    const project=join(root,"repo"); const nested=join(project,"src","deep"); mkdirSync(join(project,".continuum"),{recursive:true}); mkdirSync(nested,{recursive:true});
    writeFileSync(join(project,".continuum","project.yaml"),"schema_version: 1\n");
    assert.equal(findContinuumProjectRoot(nested),project);
    assert.equal(findContinuumProjectRoot(root),null);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("Codex global installer writes one user-level hook set and global MCP registration",async()=>{
  const root=temp("continuum-p11-codex-global-");
  try{
    const env={CODEX_HOME:join(root,"codex-home")} as NodeJS.ProcessEnv;
    let mcpExists=false; const calls:string[]=[];
    const runner=async(command:string,args:string[])=>{
      calls.push([command,...args].join(" "));
      if(args[0]==="mcp"&&args[1]==="get") { if(!mcpExists) throw new Error("missing"); return {stdout:"continuum\n",stderr:""}; }
      if(args[0]==="mcp"&&args[1]==="add") { mcpExists=true; return {stdout:"added\n",stderr:""}; }
      throw new Error("unexpected command");
    };
    const installer=new CodexGlobalInstaller(runner,()=>root,env);
    const first=await installer.install("/opt/continuum/dist/cli/index.js","/opt/continuum/runtime-assets/codex-mcp-server.mjs",true);
    const second=await installer.install("/opt/continuum/dist/cli/index.js","/opt/continuum/runtime-assets/codex-mcp-server.mjs",true);
    assert.equal(first.scope,"user"); assert.equal(first.mcp,"installed"); assert.equal(second.mcp,"existing");
    const hooks=JSON.parse(readFileSync(first.hooksPath,"utf8"));
    for(const event of ["SessionStart","UserPromptSubmit","Stop","SessionEnd"]){
      const commands=(hooks.hooks[event]??[]).flatMap((group:any)=>group.hooks??[]).map((h:any)=>String(h.command??"")).filter((c:string)=>/continuum/i.test(c));
      assert.equal(commands.length,1); assert.match(commands[0],/host codex hook --global/);
    }
    assert.match(readFileSync(first.configPath,"utf8"),/^hooks = true$/m);
    assert.equal(calls.some(call=>/mcp add continuum/.test(call)),true);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("OMP global installer targets the user agent extension directory and is idempotent",async()=>{
  const root=temp("continuum-p11-omp-global-");
  try{
    const asset=join(root,"asset.ts"); writeFileSync(asset,'const BRIDGE_SCOPE:"global"|"project"="global";\n');
    const env={} as NodeJS.ProcessEnv;
    const installer=new OmpGlobalInstaller(()=>root,env);
    const first=await installer.install(asset); const second=await installer.install(asset);
    assert.equal(first.extensionPath,join(root,".omp","agent","extensions","continuum.ts"));
    assert.equal(first.extensionInstalled,true); assert.equal(second.extensionInstalled,false);
    assert.equal(readFileSync(first.extensionPath,"utf8"),readFileSync(asset,"utf8"));
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("global host diagnostics pass for user bridges and warn on legacy project adapters",async()=>{
  const root=temp("continuum-p11-global-doctor-");
  try{
    const asset=join(root,"asset.ts"); writeFileSync(asset,'const BRIDGE_SCOPE:"global"|"project"="global";\n');
    const env={CODEX_HOME:join(root,"codex"),PI_CODING_AGENT_DIR:join(root,"omp-agent")} as NodeJS.ProcessEnv;
    let mcp=false;
    const runner=async(_command:string,args:string[])=>{
      if(args[0]==="mcp"&&args[1]==="get"){if(!mcp)throw new Error("missing");return {stdout:"ok",stderr:""};}
      if(args[0]==="mcp"&&args[1]==="add"){mcp=true;return {stdout:"ok",stderr:""};}
      throw new Error("unexpected");
    };
    await new CodexGlobalInstaller(runner,()=>root,env).install("/cli.js","/mcp.mjs");
    await new OmpGlobalInstaller(()=>root,env).install(asset);
    const clean=await new UserHostDiagnostics(asset,undefined,async()=>fakeCodexCaps(),async()=>fakeOmpCaps(),()=>root,env).inspect();
    assert.equal(clean.every(item=>item.level==="PASS"),true);

    const repo=join(root,"repo"); mkdirSync(join(repo,".codex"),{recursive:true}); mkdirSync(join(repo,".omp","extensions"),{recursive:true});
    writeFileSync(join(repo,".codex","hooks.json"),JSON.stringify({hooks:{SessionStart:[{hooks:[{type:"command",command:"continuum host codex hook"}]}]}}));
    writeFileSync(join(repo,".omp","extensions","continuum.ts"),"// legacy continuum\n");
    const legacy=await new UserHostDiagnostics(asset,repo,async()=>fakeCodexCaps(),async()=>fakeOmpCaps(),()=>root,env).inspect();
    assert.equal(legacy.every(item=>item.level==="WARN"),true);
    assert.equal(legacy.every(item=>item.details?.legacyProjectAdapter===true),true);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("global bridges are silent outside Continuum projects and global setup does not require Git",()=>{
  const root=temp("continuum-p11-silent-");
  try{
    const codex=spawnSync(process.execPath,[CLI,"host","codex","hook","--global"],{cwd:root,encoding:"utf8",input:JSON.stringify({hook_event_name:"SessionStart",session_id:"c1",cwd:root})});
    assert.equal(codex.status,0); assert.deepEqual(JSON.parse(codex.stdout),{continue:true,suppressOutput:true});
    const omp=spawnSync(process.execPath,[CLI,"host","omp","event","--global"],{cwd:root,encoding:"utf8",input:JSON.stringify({event_name:"session_start",session_id:"o1",cwd:root})});
    assert.equal(omp.status,0); assert.equal(JSON.parse(omp.stdout).state,"SILENT");
    const setup=JSON.parse(execFileSync(process.execPath,[CLI,"setup","--skip-codex","--skip-omp","--json"],{cwd:root,encoding:"utf8"}));
    assert.equal(setup.ok,true); assert.equal(setup.data.scope,"user");
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("global OMP and Codex assets expose agent-driven project operations",()=>{
  const omp=readFileSync(join(process.cwd(),"runtime-assets","omp-extension.ts"),"utf8");
  assert.match(omp,/BRIDGE_SCOPE:"global"\|"project"="global"/);
  assert.match(omp,/name:"continuum_init"/); assert.match(omp,/name:"continuum_status"/); assert.match(omp,/name:"continuum_doctor"/);
  assert.match(omp,/host","omp","event".*--global/s);
  assert.match(omp,/shouldHandleLifecycle/);

  const mcp=readFileSync(join(process.cwd(),"runtime-assets","codex-mcp-server.mjs"),"utf8");
  assert.match(mcp,/continuum_init/); assert.match(mcp,/continuum_status/); assert.match(mcp,/continuum_doctor/); assert.match(mcp,/continuum_decision/);
});
