import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

export interface CodexCapabilities {
  installed: boolean;
  version?: string;
  lifecycleHooks: boolean;
  structuredDecision: boolean;
  blockingUi: boolean;
  ambientStatus: false;
  headless: boolean;
  diagnostics: string[];
}

export type CommandRunner = (command:string,args:string[])=>Promise<{stdout:string;stderr:string}>;

async function defaultRunner(command:string,args:string[]):Promise<{stdout:string;stderr:string}>{
  const {stdout,stderr}=await execFileAsync(command,args,{encoding:"utf8"});
  return {stdout,stderr};
}

export class CodexCapabilityDetector {
  constructor(private readonly run:CommandRunner=defaultRunner){}
  async detect():Promise<CodexCapabilities>{
    const diagnostics:string[]=[];
    let version:string|undefined;
    try { version=(await this.run("codex",["--version"])).stdout.trim(); }
    catch { return {installed:false,lifecycleHooks:false,structuredDecision:false,blockingUi:false,ambientStatus:false,headless:false,diagnostics:["codex executable not found"]}; }
    let help="";
    try { help=(await this.run("codex",["--help"])).stdout; } catch(error){ diagnostics.push(`codex --help failed: ${String(error)}`); }
    let mcp=false;
    try { await this.run("codex",["mcp","--help"]); mcp=true; } catch { diagnostics.push("codex mcp command unavailable"); }
    const hooks = /hook/i.test(help) || /dangerously-bypass-hook-trust/i.test(help);
    if(!hooks) diagnostics.push("Codex hook capability was not detected from CLI help.");
    return {installed:true,version,lifecycleHooks:hooks,structuredDecision:mcp,blockingUi:hooks,ambientStatus:false,headless:false,diagnostics};
  }
}
