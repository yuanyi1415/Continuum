#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -ne 24 ]; then
  echo "FAIL: P07 production verification requires Node.js 24 LTS; found $(node --version)" >&2
  exit 2
fi
if ! command -v codex >/dev/null 2>&1; then
  echo "FAIL: Codex is required for P07 production verification." >&2
  exit 2
fi

EVIDENCE="${TMPDIR:-/tmp}/continuum-p07-production-e2e"
rm -rf "$EVIDENCE"
mkdir -p "$EVIDENCE"
printf 'node=%s\n' "$(node --version)" | tee "$EVIDENCE/environment.txt"
printf 'npm=%s\n' "$(npm --version)" | tee -a "$EVIDENCE/environment.txt"
printf 'git=%s\n' "$(git --version)" | tee -a "$EVIDENCE/environment.txt"
printf 'codex=%s\n' "$(codex --version 2>&1 | head -1)" | tee -a "$EVIDENCE/environment.txt"

npm install
npm run test:p07 | tee "$EVIDENCE/tests-p07.txt"
npm run test:p06 | tee "$EVIDENCE/tests-p06-regression.txt"
npm run test:p05 | tee "$EVIDENCE/tests-p05-regression.txt"
npm run test:p04 | tee "$EVIDENCE/tests-p04-regression.txt"
npm run test:p03 | tee "$EVIDENCE/tests-p03-regression.txt"
npm run test:p02 | tee "$EVIDENCE/tests-p02-regression.txt"
npm run test:p01 | tee "$EVIDENCE/tests-p01-regression.txt"
npm run build
node --check runtime-assets/codex-mcp-server.mjs

FIXTURE="$EVIDENCE/fixture"
SOURCE="$FIXTURE/source"
mkdir -p "$SOURCE/docs" "$SOURCE/src"
git -C "$SOURCE" init -q -b main
git -C "$SOURCE" config user.email continuum-e2e@example.com
git -C "$SOURCE" config user.name "Continuum E2E"
printf '# P07 production fixture\n' > "$SOURCE/README.md"
printf '# User Memory Spec\n' > "$SOURCE/docs/spec.md"
printf '# P03\n' > "$SOURCE/docs/p03.md"
printf '# Context\n' > "$SOURCE/CONTEXT.md"
git -C "$SOURCE" add .
git -C "$SOURCE" commit -qm initial

run_json() { (cd "$SOURCE" && node "$ROOT/dist/cli/index.js" "$@" --json); }
run_hook() { (cd "$SOURCE" && node "$ROOT/dist/cli/index.js" host codex hook); }

run_json init --name "P07 Production E2E" | tee "$EVIDENCE/init.json"
CHANGE_ID="$(run_json change open '用户 Memory' | tee "$EVIDENCE/change-open.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).data.changeId))')"
run_json artifact register docs/spec.md --type spec --id SPEC-001 --change "$CHANGE_ID" | tee "$EVIDENCE/spec.json"
run_json artifact register docs/p03.md --type ticket --id P03 --change "$CHANGE_ID" | tee "$EVIDENCE/ticket.json"
run_json artifact register CONTEXT.md --type context --id CONTEXT | tee "$EVIDENCE/context.json"
run_json relation add P03 belongs_to SPEC-001 --routing required >/dev/null
run_json relation add P03 domain_context CONTEXT --routing required >/dev/null

git -C "$SOURCE" add .continuum .gitignore docs CONTEXT.md README.md
git -C "$SOURCE" commit -qm 'persist P07 formal graph'
BASELINE="$(git -C "$SOURCE" rev-parse HEAD)"

# Install real repo-local Codex hooks, but keep MCP global registration out of the automated phase.
(cd "$SOURCE" && node "$ROOT/dist/cli/index.js" host install codex --skip-mcp --json) | tee "$EVIDENCE/host-install.json"
(cd "$SOURCE" && node "$ROOT/dist/cli/index.js" host codex capabilities --json) | tee "$EVIDENCE/capabilities.json"
node - "$EVIDENCE/capabilities.json" <<'NODE'
const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
if(!d.installed||!d.lifecycleHooks||!d.structuredDecision) throw new Error(`Codex capabilities incomplete: ${JSON.stringify(d)}`);
NODE

# Real Codex ad-hoc session: should remain unbound.
(cd "$SOURCE" && codex exec --dangerously-bypass-hook-trust 'Explain README.md in one sentence. Do not modify files.') >"$EVIDENCE/codex-adhoc.out" 2>&1 || true
run_json work current | tee "$EVIDENCE/work-after-adhoc.json"
node - "$EVIDENCE/work-after-adhoc.json" <<'NODE'
const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
if(d.binding!==null||d.mode!=='aware') throw new Error('ad-hoc Codex session unexpectedly bound Work');
NODE

# Real Codex explicit intent: Hook must bind P03 before model work.
(cd "$SOURCE" && codex exec --dangerously-bypass-hook-trust 'implement P03; do not modify files; reply with exactly: continuum-p07-bound') >"$EVIDENCE/codex-bind.out" 2>&1 || true
run_json work current | tee "$EVIDENCE/work-after-bind.json"
node - "$EVIDENCE/work-after-bind.json" "$BASELINE" <<'NODE'
const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
if(d.binding?.targetArtifactId!=='P03') throw new Error('Codex explicit intent did not bind P03');
if(d.binding.workStartRevision!==process.argv[3]) throw new Error('Codex binding moved Work Baseline');
NODE

# Business commit occurs after binding.
printf 'export const p07 = true;\n' > "$SOURCE/src/p07.ts"
git -C "$SOURCE" add src/p07.ts
git -C "$SOURCE" commit -qm 'feat: P03 business change'

# Fresh Codex session: SessionStart resumes P03; Stop/SessionEnd produces/dedupes candidate.
(cd "$SOURCE" && codex exec --dangerously-bypass-hook-trust 'Reply with exactly: continuum-p07-resumed. Do not modify files.') >"$EVIDENCE/codex-resume.out" 2>&1 || true
run_json work current | tee "$EVIDENCE/work-after-resume.json"
run_json reconcile | tee "$EVIDENCE/reconcile-after-resume.json"
node - "$EVIDENCE/work-after-resume.json" "$EVIDENCE/reconcile-after-resume.json" "$BASELINE" <<'NODE'
const fs=require('fs'); const w=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data; const r=JSON.parse(fs.readFileSync(process.argv[3],'utf8')).data;
if(w.binding?.targetArtifactId!=='P03') throw new Error('fresh Codex session did not resume P03');
if(w.binding.workStartRevision!==process.argv[4]) throw new Error('resume moved Work Baseline');
if(r.status!=='DEDUPED') throw new Error(`expected Codex lifecycle to reconcile before explicit fallback, got ${r.status}`);
if(!r.candidate?.changedFiles?.includes('src/p07.ts')) throw new Error('reconcile candidate missing business change');
NODE

# Lost-hook correctness: temporarily disable Codex hook config, make another commit, then explicit reconcile must recover.
mv "$SOURCE/.codex/hooks.json" "$SOURCE/.codex/hooks.json.disabled"
printf 'export const lostHook = true;\n' > "$SOURCE/src/lost-hook.ts"
git -C "$SOURCE" add src/lost-hook.ts
git -C "$SOURCE" commit -qm 'feat: change while Codex hook unavailable'
run_json reconcile | tee "$EVIDENCE/reconcile-lost-hook.json"
mv "$SOURCE/.codex/hooks.json.disabled" "$SOURCE/.codex/hooks.json"
node - "$EVIDENCE/reconcile-lost-hook.json" <<'NODE'
const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
if(r.status!=='UPDATED') throw new Error(`lost-hook recovery should update candidate, got ${r.status}`);
if(!r.candidate.changedFiles.includes('src/lost-hook.ts')) throw new Error('lost-hook recovery missed new Git fact');
NODE

# Seed a DECISION and prove deterministic Hook Gate fallback / numeric resolution.
node - "$SOURCE/.continuum-local/runtime.db" <<'NODE'
const DB=require('better-sqlite3'); const db=new DB(process.argv[2]);
const req={id:'int_p07_decision',type:'DECISION',title:'Choose Change destination',message:'Select one.',options:[{id:'create',label:'Create Change'},{id:'keep-active',label:'Keep active'}],blocking:true,createdAt:new Date().toISOString()};
db.prepare("INSERT OR REPLACE INTO pending_interactions(interaction_id,type,payload_json,status,created_at,resolved_at) VALUES(?,?,?,?,?,NULL)").run(req.id,req.type,JSON.stringify(req),'pending',req.createdAt); db.close();
NODE
printf '%s' "$(node -e 'process.stdout.write(JSON.stringify({hook_event_name:"UserPromptSubmit",cwd:process.argv[1],session_id:"fallback-1",prompt:"continue"}))' "$SOURCE")" | run_hook | tee "$EVIDENCE/hook-gate.json"
node - "$EVIDENCE/hook-gate.json" <<'NODE'
const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); if(r.continue!==false||r.decision!=='block'||!String(r.reason).includes('1. Create Change')) throw new Error('Hook Gate fallback did not block deterministically');
NODE
printf '%s' "$(node -e 'process.stdout.write(JSON.stringify({hook_event_name:"UserPromptSubmit",cwd:process.argv[1],session_id:"fallback-1",prompt:"1"}))' "$SOURCE")" | run_hook | tee "$EVIDENCE/hook-gate-resolve.json"

# Seed a BLOCK and prove it cannot be bypassed by normal prompt.
node - "$SOURCE/.continuum-local/runtime.db" <<'NODE'
const DB=require('better-sqlite3'); const db=new DB(process.argv[2]);
const req={id:'int_p07_block',type:'BLOCK',title:'Design gap',message:'Return to Spec before continuing.',blocking:true,createdAt:new Date().toISOString()};
db.prepare("INSERT OR REPLACE INTO pending_interactions(interaction_id,type,payload_json,status,created_at,resolved_at) VALUES(?,?,?,?,?,NULL)").run(req.id,req.type,JSON.stringify(req),'pending',req.createdAt); db.close();
NODE
printf '%s' "$(node -e 'process.stdout.write(JSON.stringify({hook_event_name:"UserPromptSubmit",cwd:process.argv[1],session_id:"block-1",prompt:"continue implementation"}))' "$SOURCE")" | run_hook | tee "$EVIDENCE/hook-block.json"
node - "$EVIDENCE/hook-block.json" <<'NODE'
const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); if(r.continue!==false||r.decision!=='block'||!String(r.reason).includes('Design gap')) throw new Error('BLOCK was not enforced');
NODE
# Clear test-only BLOCK so the optional interactive MCP test starts clean.
node - "$SOURCE/.continuum-local/runtime.db" <<'NODE'
const DB=require('better-sqlite3'); const db=new DB(process.argv[2]); db.prepare("UPDATE pending_interactions SET status='resolved', resolved_at=? WHERE interaction_id='int_p07_block'").run(new Date().toISOString()); db.close();
NODE

printf 'PASS\n' | tee "$EVIDENCE/result.txt"
echo "P07_EVIDENCE=$EVIDENCE"
echo "NEXT_OPTIONAL_REAL_GUI=$ROOT/scripts/verify-p07-codex-gui.sh"
