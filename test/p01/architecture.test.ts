import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
function walk(dir:string):string[]{ return readdirSync(dir).flatMap(name=>{const p=join(dir,name);return statSync(p).isDirectory()?walk(p):p.endsWith(".ts")?[p]:[]}); }
function imports(text:string):string[]{ return [...text.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>m[1]); }

test("architecture dependency rules are respected",()=>{
 const src=join(process.cwd(),"src"); const violations:string[]=[];
 for(const file of walk(src)){
   const rel=relative(src,file).replaceAll("\\","/"); const deps=imports(readFileSync(file,"utf8"));
   for(const dep of deps){
     if(rel.startsWith("domain/") && (dep.includes("/adapters/")||dep.includes("/application/"))) violations.push(`${rel} -> ${dep}`);
     if(rel.startsWith("application/") && dep.includes("/adapters/")) violations.push(`${rel} -> ${dep}`);
     if(rel.startsWith("ports/") && dep.includes("/adapters/")) violations.push(`${rel} -> ${dep}`);
   }
 }
 // InitProject currently calls a repo-side-effect helper; this assertion forces us to remove that exception before P02.
 assert.deepEqual(violations,[]);
});
