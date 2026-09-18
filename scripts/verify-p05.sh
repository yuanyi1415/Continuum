#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -ne 24 ]; then
  echo "FAIL: P05 production verification requires Node.js 24 LTS; found $(node --version)" >&2
  exit 2
fi

EVIDENCE="${TMPDIR:-/tmp}/continuum-p05-production-e2e"
rm -rf "$EVIDENCE"
mkdir -p "$EVIDENCE"

printf 'node=%s\n' "$(node --version)" | tee "$EVIDENCE/environment.txt"
printf 'npm=%s\n' "$(npm --version)" | tee -a "$EVIDENCE/environment.txt"
printf 'git=%s\n' "$(git --version)" | tee -a "$EVIDENCE/environment.txt"

npm install
npm run test:p05 | tee "$EVIDENCE/tests-p05.txt"
npm run test:p04 | tee "$EVIDENCE/tests-p04-regression.txt"
npm run test:p03 | tee "$EVIDENCE/tests-p03-regression.txt"
npm run test:p02 | tee "$EVIDENCE/tests-p02-regression.txt"
npm run test:p01 | tee "$EVIDENCE/tests-p01-regression.txt"
npm run build

FIXTURE="$EVIDENCE/fixture"
SOURCE="$FIXTURE/source"
mkdir -p "$SOURCE/docs" "$SOURCE/src"
git -C "$SOURCE" init -q -b main
git -C "$SOURCE" config user.email continuum-e2e@example.com
git -C "$SOURCE" config user.name "Continuum E2E"
printf '# P05 production fixture\n' > "$SOURCE/README.md"
printf '# P03\n' > "$SOURCE/docs/p03.md"
git -C "$SOURCE" add .
git -C "$SOURCE" commit -qm initial

run_json() {
  (cd "$SOURCE" && node "$ROOT/dist/cli/index.js" "$@" --json)
}

run_json init --name "P05 Production E2E" | tee "$EVIDENCE/init.json"
CHANGE_ID="$(run_json change open '用户 Memory' --intent 'P05 reconcile fixture' | tee "$EVIDENCE/change-open.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).data.changeId))')"
run_json artifact register docs/p03.md --type ticket --id P03 --title 'Runtime Read' --change "$CHANGE_ID" | tee "$EVIDENCE/register-ticket.json"

git -C "$SOURCE" add .continuum .gitignore docs/p03.md README.md
git -C "$SOURCE" commit -qm 'persist formal work graph'
printf 'adapter installed before work binding\n' > "$SOURCE/adapter-install.txt"
git -C "$SOURCE" add adapter-install.txt
git -C "$SOURCE" commit -qm 'adapter setup before bind'

run_json work bind P03 --source production-e2e | tee "$EVIDENCE/work-bind.json"
BASELINE="$(node - "$EVIDENCE/work-bind.json" <<'NODE'
const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); console.log(j.data.binding.workStartRevision);
NODE
)"
HEAD_AT_BIND="$(git -C "$SOURCE" rev-parse HEAD)"
[ "$BASELINE" = "$HEAD_AT_BIND" ] || { echo "FAIL: Work Baseline not frozen at binding HEAD" >&2; exit 1; }

run_json reconcile | tee "$EVIDENCE/reconcile-noop.json"
node - "$EVIDENCE/reconcile-noop.json" <<'NODE'
const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); if(j.data.status!=='NOOP') throw new Error(`expected NOOP, got ${j.data.status}`);
NODE

# Preserve an existing hook and install Continuum's managed block.
mkdir -p "$SOURCE/.git/hooks"
printf '#!/bin/sh\n# existing hook sentinel\ntrue\n' > "$SOURCE/.git/hooks/post-commit"
chmod +x "$SOURCE/.git/hooks/post-commit"
HOOK_COMMAND="node '$ROOT/dist/cli/index.js' lifecycle checkpoint --source git-post-commit >/dev/null 2>&1 || true"
run_json lifecycle install-git-hook --command "$HOOK_COMMAND" | tee "$EVIDENCE/install-hook.json"
grep -q 'existing hook sentinel' "$SOURCE/.git/hooks/post-commit"
grep -q 'continuum managed post-commit' "$SOURCE/.git/hooks/post-commit"

printf 'export const p03 = 1;\n' > "$SOURCE/src/example.ts"
git -C "$SOURCE" add src/example.ts
git -C "$SOURCE" commit -qm 'implement P03 first commit'
run_json reconcile | tee "$EVIDENCE/reconcile-after-first.json"

node - "$EVIDENCE/reconcile-after-first.json" "$BASELINE" <<'NODE'
const fs=require('fs');
const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
const baseline=process.argv[3];
if(j.status!=='DEDUPED') throw new Error(`post-commit hook did not reconcile first: ${j.status}`);
const c=j.candidate;
if(c.baseRevision!==baseline) throw new Error('candidate did not use Work Baseline');
if(JSON.stringify(c.changedFiles)!==JSON.stringify(['src/example.ts'])) throw new Error(`pre-bind or internal changes leaked: ${JSON.stringify(c.changedFiles)}`);
if(c.knowledgeImpact!=='N0'||JSON.stringify(c.actions)!==JSON.stringify(['AUTO'])) throw new Error('N0 action mapping mismatch');
for(const k of ['tests','review','completion']) if(c.evidence[k].status!=='UNKNOWN') throw new Error(`${k} UNKNOWN was incorrectly promoted`);
NODE

run_json lifecycle checkpoint --source session-end | tee "$EVIDENCE/duplicate-checkpoint.json"
node - "$EVIDENCE/duplicate-checkpoint.json" <<'NODE'
const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data; if(j.reconcile?.status!=='DEDUPED') throw new Error('duplicate checkpoint must dedupe');
NODE

printf 'export const p03Second = 2;\n' > "$SOURCE/src/second.ts"
git -C "$SOURCE" add src/second.ts
git -C "$SOURCE" commit -qm 'implement P03 second commit'
run_json reconcile | tee "$EVIDENCE/reconcile-after-second.json"
node - "$EVIDENCE/reconcile-after-second.json" <<'NODE'
const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data; if(j.status!=='DEDUPED') throw new Error('second commit hook should reconcile before explicit check');
const files=[...j.candidate.changedFiles].sort(); if(JSON.stringify(files)!==JSON.stringify(['src/example.ts','src/second.ts'])) throw new Error(`pending candidate did not update: ${files}`);
NODE

# One Work must still have exactly one pending candidate row.
node - "$SOURCE/.continuum-local/runtime.db" <<'NODE'
const DB=require('better-sqlite3'); const db=new DB(process.argv[2]);
const row=db.prepare('SELECT COUNT(*) AS count FROM pending_reconciles').get();
if(row.count!==1) throw new Error(`expected one pending candidate, got ${row.count}`);
const health=db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get(); if(health.version!==1) throw new Error('runtime schema mismatch');
db.close();
NODE

# Simulate a lost Hook: disable it, commit, then recover from state later.
mv "$SOURCE/.git/hooks/post-commit" "$SOURCE/.git/hooks/post-commit.disabled"
printf 'lost hook but recoverable\n' > "$SOURCE/lost-hook.txt"
git -C "$SOURCE" add lost-hook.txt
git -C "$SOURCE" commit -qm 'commit while lifecycle hook is missing'
run_json reconcile | tee "$EVIDENCE/lost-hook-recovery.json"
node - "$EVIDENCE/lost-hook-recovery.json" <<'NODE'
const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
if(j.status!=='UPDATED') throw new Error(`lost-hook recovery did not derive new state: ${j.status}`);
if(!j.candidate.changedFiles.includes('lost-hook.txt')) throw new Error('lost-hook commit was not rediscovered');
NODE

run_json status | tee "$EVIDENCE/status.json"
node - "$EVIDENCE/status.json" <<'NODE'
const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
if(j.runtime.driver!=='better-sqlite3') throw new Error(`production runtime driver mismatch: ${j.runtime.driver}`);
NODE

# Work Reconcile is runtime-only; P05 must not create durable ticket reconcile artifacts.
if find "$SOURCE/.continuum/reconciles" -type f -print -quit | grep -q .; then
  echo 'FAIL: Work Reconcile leaked into durable .continuum/reconciles' >&2
  exit 1
fi

printf 'PASS\n' | tee "$EVIDENCE/result.txt"
echo "P05_EVIDENCE=$EVIDENCE"
