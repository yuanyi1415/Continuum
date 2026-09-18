#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -ne 24 ]; then
  echo "FAIL: P06 production verification requires Node.js 24 LTS; found $(node --version)" >&2
  exit 2
fi

EVIDENCE="${TMPDIR:-/tmp}/continuum-p06-production-e2e"
rm -rf "$EVIDENCE"
mkdir -p "$EVIDENCE"

printf 'node=%s\n' "$(node --version)" | tee "$EVIDENCE/environment.txt"
printf 'npm=%s\n' "$(npm --version)" | tee -a "$EVIDENCE/environment.txt"
printf 'git=%s\n' "$(git --version)" | tee -a "$EVIDENCE/environment.txt"

npm install
npm run test:p06 | tee "$EVIDENCE/tests-p06.txt"
npm run test:p05 | tee "$EVIDENCE/tests-p05-regression.txt"
npm run test:p04 | tee "$EVIDENCE/tests-p04-regression.txt"
npm run test:p03 | tee "$EVIDENCE/tests-p03-regression.txt"
npm run test:p02 | tee "$EVIDENCE/tests-p02-regression.txt"
npm run test:p01 | tee "$EVIDENCE/tests-p01-regression.txt"
npm run compile

FIXTURE="$EVIDENCE/fixture"
SOURCE="$FIXTURE/source"
CLONE="$FIXTURE/clone"
mkdir -p "$SOURCE/docs" "$SOURCE/src"
git -C "$SOURCE" init -q -b main
git -C "$SOURCE" config user.email continuum-e2e@example.com
git -C "$SOURCE" config user.name "Continuum E2E"
printf '# P06 production fixture\n' > "$SOURCE/README.md"
printf '# User Memory Spec\n' > "$SOURCE/docs/spec.md"
printf '# P03\n' > "$SOURCE/docs/p03.md"
git -C "$SOURCE" add .
git -C "$SOURCE" commit -qm initial

run_json() { (cd "$SOURCE" && node "$ROOT/dist/cli/index.js" "$@" --json); }

run_json init --name "P06 Production E2E" | tee "$EVIDENCE/init.json"
CHANGE_ID="$(run_json change open '用户 Memory' --intent 'P06 change reconcile fixture' | tee "$EVIDENCE/change-open.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).data.changeId))')"
run_json artifact register docs/spec.md --type spec --id SPEC-001 --title 'User Memory Spec' --change "$CHANGE_ID" | tee "$EVIDENCE/register-spec.json"
run_json artifact register docs/p03.md --type ticket --id P03 --title 'Runtime Read' --change "$CHANGE_ID" | tee "$EVIDENCE/register-ticket.json"

git -C "$SOURCE" add .continuum .gitignore docs README.md
git -C "$SOURCE" commit -qm 'persist formal change graph'
run_json work bind P03 --source production-e2e | tee "$EVIDENCE/work-bind.json"

printf 'export const memory = true;\n' > "$SOURCE/src/memory.ts"
git -C "$SOURCE" add src/memory.ts
git -C "$SOURCE" commit -qm 'implement P03'
run_json reconcile | tee "$EVIDENCE/work-reconcile.json"

# P07/P08 will provide host-native test/review/completion evidence. For P06 production
# verification, explicitly upgrade the fixture candidate to simulate verified upstream evidence.
node - "$SOURCE/.continuum-local/runtime.db" <<'NODE'
const DB=require('better-sqlite3');
const db=new DB(process.argv[2]);
const row=db.prepare('SELECT work_id,evidence_json FROM pending_reconciles').get();
if(!row) throw new Error('pending Work Reconcile is missing');
const pass={status:'PASS',source:'p06-production-fixture'};
db.prepare('UPDATE pending_reconciles SET evidence_json=? WHERE work_id=?').run(JSON.stringify({tests:pass,review:pass,completion:pass}),row.work_id);
const driver=db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get(); if(driver.version!==1) throw new Error('runtime schema mismatch');
db.close();
NODE

OLD_SNAPSHOT="$(node - "$SOURCE/.continuum/current.yaml" <<'NODE'
const fs=require('fs'); const YAML=require('yaml'); const d=YAML.parse(fs.readFileSync(process.argv[2],'utf8')); console.log(d.snapshot_id);
NODE
)"
run_json change close "$CHANGE_ID" | tee "$EVIDENCE/change-close.json"

node - "$EVIDENCE/change-close.json" "$OLD_SNAPSHOT" "$CHANGE_ID" <<'NODE'
const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
if(j.status!=='CLOSED') throw new Error(`expected CLOSED, got ${j.status}`);
if(j.reconcile.result!=='pass') throw new Error('durable reconcile did not pass');
if(j.snapshot.snapshotId===process.argv[3]) throw new Error('Current Snapshot did not advance');
if(j.change.changeId!==process.argv[4]||j.change.status!=='closed') throw new Error('Change did not close');
NODE

run_json status | tee "$EVIDENCE/status-after-close.json"
node - "$EVIDENCE/status-after-close.json" "$CHANGE_ID" <<'NODE'
const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
if(d.changes.active.some(c=>c.changeId===process.argv[3])) throw new Error('closed Change still appears active');
if(d.work.mode!=='aware'||d.work.binding!==null) throw new Error('Work binding was not cleaned after Change close');
if(d.runtime.driver!=='better-sqlite3') throw new Error(`runtime driver mismatch: ${d.runtime.driver}`);
NODE

COUNT="$(find "$SOURCE/.continuum/reconciles" -type f -name 'change_*.yaml' | wc -l | tr -d ' ')"
[ "$COUNT" -eq 1 ] || { echo "FAIL: expected one durable Change Reconcile, got $COUNT" >&2; exit 1; }

# Persist durable convergence and prove it survives clone without runtime.db.
git -C "$SOURCE" add .continuum
git -C "$SOURCE" commit -qm 'persist P06 change convergence'
git clone -q "$SOURCE" "$CLONE"
(cd "$CLONE" && node "$ROOT/dist/cli/index.js" status --json) | tee "$EVIDENCE/clone-status.json"
node - "$EVIDENCE/clone-status.json" "$CHANGE_ID" <<'NODE'
const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
if(d.changes.active.some(c=>c.changeId===process.argv[3])) throw new Error('clone resurrected closed Change');
if(d.runtime.available!==false) throw new Error('clone unexpectedly carried runtime.db');
NODE

printf 'PASS\n' | tee "$EVIDENCE/result.txt"
echo "P06_EVIDENCE=$EVIDENCE"
