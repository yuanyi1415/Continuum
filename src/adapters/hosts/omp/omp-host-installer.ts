import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface OmpInstallResult {
  extensionPath:string;
  instructionsPath:string;
  extensionInstalled:boolean;
  instructionsUpdated:boolean;
  warnings:string[];
}

const AGENTS_START="<!-- continuum:omp:start -->";
const AGENTS_END="<!-- continuum:omp:end -->";
const AGENTS_BLOCK=`${AGENTS_START}
## Continuum OMP integration

A project-local Oh My Pi extension manages Continuum lifecycle events, Work continuity, and host-native interactions. Do not manually recreate Continuum state from chat memory. When Continuum detects a design conflict, stop formal implementation and return to design; normal design/research discussion remains available. After the relevant Spec/ADR has been updated, the user may start the same Work again and Continuum will ask whether to restart from the latest design. Never choose that restart decision on the user's behalf. Session suppression must not bypass a design conflict. The current worktree binding is shared across Agent sessions.
${AGENTS_END}`;

function mergeAgents(text:string):{text:string;changed:boolean}{
  const start=text.indexOf(AGENTS_START), end=text.indexOf(AGENTS_END);
  const next=start>=0&&end>=start
    ? `${text.slice(0,start).trimEnd()}${text.slice(0,start).trim()?"\n\n":""}${AGENTS_BLOCK}${text.slice(end+AGENTS_END.length)}`.trimEnd()+"\n"
    : `${text.trimEnd()}${text.trim()?"\n\n":""}${AGENTS_BLOCK}\n`;
  return {text:next,changed:next!==text};
}

export class OmpHostInstaller {
  async install(repositoryRoot:string,extensionAssetPath:string):Promise<OmpInstallResult>{
    const extensionPath=join(repositoryRoot,".omp","extensions","continuum.ts");
    await mkdir(dirname(extensionPath),{recursive:true});
    let extensionInstalled=true;
    try {
      const [existing,asset]=await Promise.all([readFile(extensionPath,"utf8"),readFile(extensionAssetPath,"utf8")]);
      if(existing===asset) extensionInstalled=false;
    } catch {}
    if(extensionInstalled) await copyFile(extensionAssetPath,extensionPath);

    const instructionsPath=join(repositoryRoot,"AGENTS.md");
    let agents=""; try{agents=await readFile(instructionsPath,"utf8");}catch{}
    const merged=mergeAgents(agents);
    if(merged.changed) await writeFile(instructionsPath,merged.text,"utf8");
    return {extensionPath,instructionsPath,extensionInstalled,instructionsUpdated:merged.changed,warnings:[]};
  }
}
