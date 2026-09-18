#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVIDENCE="${TMPDIR:-/tmp}/continuum-p09-production-e2e"
REPO="$EVIDENCE/repo"
CLI="$ROOT/dist/cli/index.js"

fail(){ echo "P09 VERIFY FAIL: $*" >&2; exit 1; }
json_assert(){ node - "$1" "$2" <<'NODE'
const fs=require('fs'); const [path,expr]=process.argv.slice(2); const j=JSON.parse(fs.readFileSync(path,'utf8')); const fn=new Function('j',`return (${expr})`); if(!fn(j)){console.error(JSON.stringify(j,null,2)); process.exit(1)}
NODE
}

if [ "${CONTINUUM_VERIFY_ALLOW_UNSUPPORTED_NODE:-0}" != "1" ]; then
  node -e 'const m=process.versions.node.split(".").map(Number); if(m[0]!==24) process.exit(2)' || fail "Node 24 is required"
fi
command -v git >/dev/null || fail "git not found"
if [ ! -f "$CLI" ]; then
  echo "Building Continuum P09..."
  (cd "$ROOT" && npm install && npm run build)
fi

rm -rf "$EVIDENCE"; mkdir -p "$REPO"
cd "$REPO"
git init -q
git config user.email continuum-p09@example.com
git config user.name 'Continuum P09'
printf '# P09 fixture\n' > README.md
git add README.md && git commit -qm initial

node "$CLI" init --name 'P09 Production E2E' --json > "$EVIDENCE/init.json"
node "$CLI" doctor --json > "$EVIDENCE/doctor-initial.json"
json_assert "$EVIDENCE/doctor-initial.json" 'j.ok===true && j.data.checks.some(c=>c.name==="runtime" && c.level==="PASS")'
if [ "${CONTINUUM_DEV_ALLOW_NODE_SQLITE:-0}" != "1" ]; then
  json_assert "$EVIDENCE/doctor-initial.json" 'j.data.checks.find(c=>c.name==="runtime").message.includes("better-sqlite3")'
fi

# Durable explicit migration v0 -> v1.
node - "$REPO/.continuum/project.yaml" <<'NODE'
const fs=require('fs'); const p=process.argv[2]; fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('schema_version: 1','schema_version: 0'));
NODE
set +e
node "$CLI" doctor --json > "$EVIDENCE/doctor-old-schema.json"
code=$?
set -e
[ "$code" -eq 2 ] || fail "old durable schema should require explicit migration"
node "$CLI" migrate --json > "$EVIDENCE/migrate.json"
json_assert "$EVIDENCE/migrate.json" 'j.ok===true && j.data.durable.migratedFiles.includes(".continuum/project.yaml") && j.data.runtime.toVersion===2'
[ -d "$REPO/.continuum-local/backups" ] || fail "durable migration backup missing"

# Missing runtime DB -> rebuild, no invented Work binding.
rm -f "$REPO/.continuum-local/runtime.db" "$REPO/.continuum-local/runtime.db-wal" "$REPO/.continuum-local/runtime.db-shm"
node "$CLI" doctor --recover --json > "$EVIDENCE/recover-missing-runtime.json"
json_assert "$EVIDENCE/recover-missing-runtime.json" 'j.data.checks.some(c=>c.name==="runtime-recovery" && c.repaired===true) && j.data.checks.some(c=>c.name==="runtime" && c.level==="PASS")'

# Corrupt runtime DB -> preserve corrupt bytes + rebuild.
rm -f "$REPO/.continuum-local/runtime.db" "$REPO/.continuum-local/runtime.db-wal" "$REPO/.continuum-local/runtime.db-shm"
printf 'not a sqlite database' > "$REPO/.continuum-local/runtime.db"
node "$CLI" doctor --recover --json > "$EVIDENCE/recover-corrupt-runtime.json"
json_assert "$EVIDENCE/recover-corrupt-runtime.json" 'j.data.checks.some(c=>c.name==="runtime-recovery" && c.repaired===true && c.message.includes("quarantined"))'
ls "$REPO/.continuum-local"/runtime.db.corrupt-* >/dev/null 2>&1 || fail "corrupt runtime DB was not preserved"

# Lost lifecycle hook -> derive pending Work from binding + Git.
mkdir -p docs
printf '# P03\n' > docs/p03.md
CHANGE=$(node "$CLI" change open 'P09 recovery' --json | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).data.changeId))')
node "$CLI" artifact register docs/p03.md --type ticket --id P03 --change "$CHANGE" --json >/dev/null
git add . && git commit -qm 'prepare managed work'
node "$CLI" work bind P03 --source p09-production --json >/dev/null
printf 'export const p09 = true;\n' > implementation.ts
git add implementation.ts && git commit -qm 'business commit without lifecycle hook'
node "$CLI" doctor --json > "$EVIDENCE/doctor-lost-hook.json"
json_assert "$EVIDENCE/doctor-lost-hook.json" 'j.data.checks.some(c=>c.name==="pending-work" && c.level==="WARN")'
node "$CLI" doctor --recover --json > "$EVIDENCE/recover-lost-hook.json"
json_assert "$EVIDENCE/recover-lost-hook.json" 'j.data.checks.some(c=>c.name==="pending-work" && c.level==="PASS" && c.repaired===true)'

# Broken Current pointer must never be guessed.
cp "$REPO/.continuum/current.yaml" "$EVIDENCE/current.good.yaml"
node - "$REPO/.continuum/current.yaml" <<'NODE'
const fs=require('fs'); const p=process.argv[2]; fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/snapshot_id: .+/,'snapshot_id: snap_missing'));
NODE
set +e
node "$CLI" doctor --recover --json > "$EVIDENCE/doctor-broken-current.json"
code=$?
set -e
[ "$code" -eq 2 ] || fail "broken Current pointer must fail closed"
json_assert "$EVIDENCE/doctor-broken-current.json" 'j.data.checks.some(c=>c.name==="current-pointer" && c.level==="FAIL" && c.message.includes("will not guess"))'
cp "$EVIDENCE/current.good.yaml" "$REPO/.continuum/current.yaml"

# Missing Artifact authority must be explicit.
printf '# Spec\n' > docs/spec.md
node "$CLI" artifact register docs/spec.md --type spec --id SPEC-P09 --json >/dev/null
rm docs/spec.md
set +e
node "$CLI" doctor --json > "$EVIDENCE/doctor-missing-artifact.json"
code=$?
set -e
[ "$code" -eq 2 ] || fail "missing Artifact authority must fail doctor"
json_assert "$EVIDENCE/doctor-missing-artifact.json" 'j.data.checks.some(c=>c.name==="artifact-authority" && c.code==="CONTINUUM_AUTHORITY_UNAVAILABLE")'

node "$CLI" host doctor --json > "$EVIDENCE/host-doctor.json"
json_assert "$EVIDENCE/host-doctor.json" 'Array.isArray(j.data) && j.data.some(x=>x.host==="codex") && j.data.some(x=>x.host==="omp")'

echo "P09 PRODUCTION VERIFY: PASS"
echo "Evidence: $EVIDENCE"
