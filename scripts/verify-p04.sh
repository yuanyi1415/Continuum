#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -ne 24 ]; then
  echo "FAIL: P04 production verification requires Node.js 24 LTS; found $(node --version)" >&2
  exit 2
fi

EVIDENCE="${TMPDIR:-/tmp}/continuum-p04-production-e2e"
rm -rf "$EVIDENCE"
mkdir -p "$EVIDENCE"

printf 'node=%s\n' "$(node --version)" | tee "$EVIDENCE/environment.txt"
printf 'npm=%s\n' "$(npm --version)" | tee -a "$EVIDENCE/environment.txt"
printf 'git=%s\n' "$(git --version)" | tee -a "$EVIDENCE/environment.txt"

npm install
npm run test:p04 | tee "$EVIDENCE/tests-p04.txt"
npm run test:p03 | tee "$EVIDENCE/tests-p03-regression.txt"
npm run test:p02 | tee "$EVIDENCE/tests-p02-regression.txt"
npm run test:p01 | tee "$EVIDENCE/tests-p01-regression.txt"
npm run compile

FIXTURE="$EVIDENCE/fixture"
SOURCE="$FIXTURE/source"
CLONE="$FIXTURE/clone"
mkdir -p "$SOURCE/docs/specs" "$SOURCE/docs/tickets" "$SOURCE/docs/adrs" "$SOURCE/docs/random"
git -C "$SOURCE" init -q -b main
git -C "$SOURCE" config user.email continuum-e2e@example.com
git -C "$SOURCE" config user.name "Continuum E2E"
printf '# P04 production fixture\n' > "$SOURCE/README.md"
printf '# Project Context\nDOMAIN SENTINEL\n' > "$SOURCE/CONTEXT.md"
printf '# User Memory Spec\nSPEC SENTINEL\n' > "$SOURCE/docs/specs/SPEC-001-user-memory.md"
printf '# Runtime Read\nTICKET SENTINEL\n' > "$SOURCE/docs/tickets/P03-runtime-read.md"
printf '# Memory Boundary\nADR SENTINEL\n' > "$SOURCE/docs/adrs/ADR-002-memory-boundary.md"
printf '# Historical Spec\nOLD SENTINEL\n' > "$SOURCE/docs/specs/SPEC-OLD.md"
printf '# Unrelated\nUNRELATED SENTINEL\n' > "$SOURCE/docs/random/P99-should-not-load.md"
printf '# Optional Evidence\nEVIDENCE SENTINEL\n' > "$SOURCE/docs/evidence.md"
git -C "$SOURCE" add .
git -C "$SOURCE" commit -qm initial

run_json() {
  (cd "$SOURCE" && node "$ROOT/dist/cli/index.js" "$@" --json)
}

run_json init --name "P04 Production E2E" | tee "$EVIDENCE/init.json"
CHANGE_ID="$(run_json change open '用户 Memory' --intent 'Matt integration and minimal context routing' | tee "$EVIDENCE/change-open.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).data.changeId))')"
run_json matt scan --change "$CHANGE_ID" | tee "$EVIDENCE/matt-scan.json"
run_json artifact register docs/specs/SPEC-OLD.md --type spec --id SPEC-OLD | tee "$EVIDENCE/register-old.json"
run_json artifact register docs/evidence.md --type evidence --id EVIDENCE-1 | tee "$EVIDENCE/register-evidence.json"
run_json relation add P03 belongs_to SPEC-001 | tee "$EVIDENCE/relation-parent.json"
run_json relation add P03 domain_context CONTEXT | tee "$EVIDENCE/relation-context.json"
run_json relation add SPEC-001 governed_by ADR-002 | tee "$EVIDENCE/relation-adr.json"
run_json relation add P03 governed_by SPEC-OLD --routing historical | tee "$EVIDENCE/relation-historical.json"
run_json relation add P03 evidence EVIDENCE-1 --routing optional | tee "$EVIDENCE/relation-optional.json"
run_json context P03 | tee "$EVIDENCE/context.json"
run_json matt scan --change "$CHANGE_ID" | tee "$EVIDENCE/matt-scan-repeat.json"

node - "$EVIDENCE/matt-scan.json" "$EVIDENCE/matt-scan-repeat.json" "$EVIDENCE/context.json" <<'NODE'
const fs=require('fs');
const scan=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
const repeat=JSON.parse(fs.readFileSync(process.argv[3],'utf8')).data;
const context=JSON.parse(fs.readFileSync(process.argv[4],'utf8')).data;
const discovered=scan.discovered.map(x=>x.artifactId).sort();
const expected=['ADR-002','CONTEXT','P03','SPEC-001'];
if(JSON.stringify(discovered)!==JSON.stringify(expected)) throw new Error(`unexpected Matt discovery: ${discovered}`);
if(scan.discovered.some(x=>x.artifactId==='P99')) throw new Error('bounded Matt observer scanned unrelated docs');
if(repeat.registered.length!==0) throw new Error('repeated Matt scan must be idempotent');
const required=context.required.map(x=>x.artifactId);
if(JSON.stringify(required)!==JSON.stringify(['P03','CONTEXT','SPEC-001','ADR-002'])) throw new Error(`wrong required context: ${required}`);
if(JSON.stringify(context.optional.map(x=>x.artifactId))!==JSON.stringify(['EVIDENCE-1'])) throw new Error('optional context mismatch');
if(JSON.stringify(context.excludedHistorical)!==JSON.stringify(['SPEC-OLD'])) throw new Error('historical exclusion mismatch');
if(required.includes('P99')) throw new Error('unrelated document leaked into context');
NODE

# Context routing is durable and must survive clone without runtime state.
git -C "$SOURCE" add .continuum .gitignore
git -C "$SOURCE" commit -qm 'persist p04 graph'
git clone -q "$SOURCE" "$CLONE"
(
  cd "$CLONE"
  node "$ROOT/dist/cli/index.js" context P03 --json | tee "$EVIDENCE/clone-context.json"
  node "$ROOT/dist/cli/index.js" status --json | tee "$EVIDENCE/clone-status.json"
)
node - "$EVIDENCE/clone-context.json" "$EVIDENCE/clone-status.json" <<'NODE'
const fs=require('fs');
const context=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
const status=JSON.parse(fs.readFileSync(process.argv[3],'utf8')).data;
if(JSON.stringify(context.required.map(x=>x.artifactId))!==JSON.stringify(['P03','CONTEXT','SPEC-001','ADR-002'])) throw new Error('clone context graph changed');
if(status.runtime.available!==false) throw new Error('runtime state crossed clone boundary');
NODE

printf 'PASS\n' | tee "$EVIDENCE/result.txt"
echo "P04_EVIDENCE=$EVIDENCE"
