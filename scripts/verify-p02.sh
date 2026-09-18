#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -ne 24 ]; then
  echo "FAIL: P02 production verification requires Node.js 24 LTS; found $(node --version)" >&2
  exit 2
fi

EVIDENCE="${TMPDIR:-/tmp}/continuum-p02-production-e2e"
rm -rf "$EVIDENCE"
mkdir -p "$EVIDENCE"

printf 'node=%s\n' "$(node --version)" | tee "$EVIDENCE/environment.txt"
printf 'npm=%s\n' "$(npm --version)" | tee -a "$EVIDENCE/environment.txt"
printf 'git=%s\n' "$(git --version)" | tee -a "$EVIDENCE/environment.txt"

npm install
npm run test:p02 | tee "$EVIDENCE/tests-p02.txt"
npm run test:p01 | tee "$EVIDENCE/tests-p01-regression.txt"
npm run compile

FIXTURE="$EVIDENCE/fixture"
SOURCE="$FIXTURE/source"
CLONE="$FIXTURE/clone"
mkdir -p "$SOURCE/docs"
git -C "$SOURCE" init -q -b main
git -C "$SOURCE" config user.email continuum-e2e@example.com
git -C "$SOURCE" config user.name "Continuum E2E"
printf '# P02 production fixture\n' > "$SOURCE/README.md"
printf '# User Memory Spec\nBODY_SENTINEL_P02_DO_NOT_COPY_7f5c3b\n' > "$SOURCE/docs/spec.md"
printf '# P03 Runtime Read\n' > "$SOURCE/docs/p03.md"
printf '# Domain Context\n' > "$SOURCE/CONTEXT.md"
printf '# Old Spec\n' > "$SOURCE/docs/old-spec.md"
git -C "$SOURCE" add README.md docs CONTEXT.md
git -C "$SOURCE" commit -qm initial

run_json() {
  (cd "$SOURCE" && node "$ROOT/dist/cli/index.js" "$@" --json)
}

run_json init --name "P02 Production E2E" | tee "$EVIDENCE/init.json"
CHANGE_ID="$(run_json change open '用户 Memory' --intent 'Add user-scoped memory' | tee "$EVIDENCE/change-open.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).data.changeId))')"

run_json artifact register docs/spec.md --type spec --id SPEC-001 --title "User Memory Spec" --change "$CHANGE_ID" | tee "$EVIDENCE/register-spec.json"
run_json artifact register docs/p03.md --type ticket --id P03 --title "Runtime Read" --change "$CHANGE_ID" | tee "$EVIDENCE/register-ticket.json"
run_json artifact register CONTEXT.md --type context --id CONTEXT | tee "$EVIDENCE/register-context.json"
run_json artifact register docs/old-spec.md --type spec --id SPEC-OLD | tee "$EVIDENCE/register-old.json"
run_json relation add P03 belongs_to SPEC-001 | tee "$EVIDENCE/relation-ticket-spec.json"
run_json relation add P03 domain_context CONTEXT | tee "$EVIDENCE/relation-context.json"
run_json relation add P03 governed_by SPEC-OLD --routing historical | tee "$EVIDENCE/relation-historical.json"

run_json status | tee "$EVIDENCE/source-status.json"
run_json change show "$CHANGE_ID" | tee "$EVIDENCE/change-show.json"
run_json artifact list | tee "$EVIDENCE/artifact-list.json"
run_json relation list --for P03 | tee "$EVIDENCE/relation-list-p03.json"

if ! grep -q '"driver": "better-sqlite3"' "$EVIDENCE/source-status.json"; then
  echo "FAIL: production verification did not use better-sqlite3" >&2
  exit 3
fi

node - "$EVIDENCE/source-status.json" "$EVIDENCE/change-show.json" "$EVIDENCE/relation-list-p03.json" "$CHANGE_ID" <<'NODE'
const fs=require('fs');
const [statusPath,changePath,relationsPath,changeId]=process.argv.slice(2);
const status=JSON.parse(fs.readFileSync(statusPath,'utf8')).data;
const change=JSON.parse(fs.readFileSync(changePath,'utf8')).data;
const relations=JSON.parse(fs.readFileSync(relationsPath,'utf8')).data;
if (status.current.activeChanges.length !== 1 || status.current.activeChanges[0] !== changeId) throw new Error('active Change missing from status');
if (JSON.stringify(change.specRefs) !== JSON.stringify(['SPEC-001'])) throw new Error('specRefs mismatch');
if (JSON.stringify(change.ticketRefs) !== JSON.stringify(['P03'])) throw new Error('ticketRefs mismatch');
if (relations.length !== 4) throw new Error(`expected 4 P03 relations, got ${relations.length}`);
if (relations.filter(r=>r.routing==='historical').length !== 1) throw new Error('historical relation missing');
NODE

ARTIFACT_YAML="$SOURCE/.continuum/artifacts/artifact_SPEC-001.yaml"
if grep -q 'BODY_SENTINEL_P02_DO_NOT_COPY_7f5c3b' "$ARTIFACT_YAML"; then
  echo "FAIL: ArtifactRef copied source body into durable index" >&2
  exit 4
fi

node --input-type=module - "$ARTIFACT_YAML" <<'NODE'
import fs from 'node:fs';
import YAML from 'yaml';
const path=process.argv[2];
const doc=YAML.parse(fs.readFileSync(path,'utf8'));
const allowed=new Set(['schema_version','artifact_id','type','authority','locator','version','title','metadata']);
for (const key of Object.keys(doc)) {
  if (!allowed.has(key)) throw new Error(`unexpected durable ArtifactRef field: ${key}`);
}
for (const forbidden of ['content','body','text','raw','source_body']) {
  if (Object.prototype.hasOwnProperty.call(doc, forbidden)) throw new Error(`forbidden ArtifactRef field: ${forbidden}`);
}
NODE

# Graph is durable and must survive clone. Runtime state must not cross the boundary.
git -C "$SOURCE" add .continuum .gitignore
git -C "$SOURCE" commit -qm 'initialize continuum graph'
git clone -q "$SOURCE" "$CLONE"
(
  cd "$CLONE"
  node "$ROOT/dist/cli/index.js" status --json | tee "$EVIDENCE/clone-status.json"
  node "$ROOT/dist/cli/index.js" change list --json | tee "$EVIDENCE/clone-changes.json"
  node "$ROOT/dist/cli/index.js" artifact list --json | tee "$EVIDENCE/clone-artifacts.json"
  node "$ROOT/dist/cli/index.js" relation list --for P03 --json | tee "$EVIDENCE/clone-relations.json"
)

node - "$EVIDENCE/clone-status.json" "$EVIDENCE/clone-changes.json" "$EVIDENCE/clone-artifacts.json" "$EVIDENCE/clone-relations.json" "$CHANGE_ID" <<'NODE'
const fs=require('fs');
const [statusPath,changesPath,artifactsPath,relationsPath,changeId]=process.argv.slice(2);
const status=JSON.parse(fs.readFileSync(statusPath,'utf8')).data;
const changes=JSON.parse(fs.readFileSync(changesPath,'utf8')).data;
const artifacts=JSON.parse(fs.readFileSync(artifactsPath,'utf8')).data;
const relations=JSON.parse(fs.readFileSync(relationsPath,'utf8')).data;
if (status.runtime.available !== false) throw new Error('runtime state crossed clone boundary');
if (!changes.some(c=>c.changeId===changeId && c.status==='active')) throw new Error('Change did not survive clone');
if (!artifacts.some(a=>a.artifactId==='SPEC-001') || !artifacts.some(a=>a.artifactId==='P03')) throw new Error('Artifacts did not survive clone');
if (relations.length !== 4) throw new Error('Relations did not survive clone');
NODE

if [ -e "$CLONE/.continuum-local/runtime.db" ]; then
  echo "FAIL: runtime.db crossed clone boundary" >&2
  exit 5
fi

printf 'PASS\n' | tee "$EVIDENCE/result.txt"
echo "P02_EVIDENCE=$EVIDENCE"
