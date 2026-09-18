import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync=promisify(execFile);

export interface OmpCapabilities {
  installed:boolean;
  version?:string;
  lifecycleHooks:boolean;
  projectExtensions:boolean;
  ambientWidget:boolean;
  structuredDecision:boolean;
  blockingUi:boolean;
  headless:boolean;
  diagnostics:string[];
}

export type OmpCommandRunner=(command:string,args:string[])=>Promise<{stdout:string;stderr:string}>;
async function defaultRunner(command:string,args:string[]):Promise<{stdout:string;stderr:string}>{
  const {stdout,stderr}=await execFileAsync(command,args,{encoding:"utf8"});
  return {stdout,stderr};
}

export class OmpCapabilityDetector {
  constructor(private readonly run:OmpCommandRunner=defaultRunner){}
  async detect():Promise<OmpCapabilities>{
    const diagnostics:string[]=[];
    let version:string|undefined;
    try { version=(await this.run("omp",["--version"])).stdout.trim(); }
    catch { return {installed:false,lifecycleHooks:false,projectExtensions:false,ambientWidget:false,structuredDecision:false,blockingUi:false,headless:false,diagnostics:["omp executable not found"]}; }
    let help="";
    try { help=(await this.run("omp",["--help"])).stdout; } catch(error){ diagnostics.push(`omp --help failed: ${String(error)}`); }
    const extensionFlag=/--extension\b|--hook\b/.test(help);
    if(!extensionFlag) diagnostics.push("OMP extension capability was not detected from CLI help.");
    return {
      installed:true,
      version,
      lifecycleHooks:extensionFlag,
      projectExtensions:extensionFlag,
      ambientWidget:extensionFlag,
      structuredDecision:extensionFlag,
      blockingUi:extensionFlag,
      headless:/--print\b/.test(help),
      diagnostics,
    };
  }
}
