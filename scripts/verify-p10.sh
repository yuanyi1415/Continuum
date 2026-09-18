#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVIDENCE="${TMPDIR:-/tmp}/continuum-p10-production-e2e"
REPO="$EVIDENCE/repo"
STANDALONE="$EVIDENCE/standalone-archive"
RESTORED="$EVIDENCE/restored-from-bundle"
TAMPERED="$EVIDENCE/tampered-archive"
CLI="$ROOT/dist/cli/index.js"

fail(){ echo "P10 VERIFY FAIL: $*" >&2; exit 1; }
json_assert(){ node - "$1" "$2" <<'NODE'
const fs=require('fs'); const [path,expr]=process.argv.slice(2); const j=JSON.parse(fs.readFileSync(path,'utf8')); const fn=new Function('j',`return (${expr})`); if(!fn(j)){console.error(JSON.stringify(j,null,2)); process.exit(1)}
NODE
}
json_field(){ node - "$1" "$2" <<'NODE'
const fs=require('fs'); const [path,expr]=process.argv.slice(2); const j=JSON.parse(fs.readFileSync(path,'utf8')); const fn=new Function('j',`return (${expr})`); const v=fn(j); if(v===undefined||v===null) process.exit(2); process.stdout.write(String(v));
NODE
}

if [ "${CONTINUUM_VERIFY_ALLOW_UNSUPPORTED_NODE:-0}" != "1" ]; then
  node -e 'const m=process.versions.node.split(".").map(Number); if(m[0]!==24) process.exit(2)' || fail "Node 24 is required"
fi
command -v git >/dev/null || fail "git not found"
command -v tar >/dev/null || fail "tar not found"
if [ ! -f "$CLI" ]; then
  echo "Building Continuum P10..."
  (cd "$ROOT" && npm install && npm run build)
fi

rm -rf "$EVIDENCE"; mkdir -p "$REPO"
cd "$REPO"
git init -q
git config user.email continuum-p10@example.com
git config user.name 'Continuum P10'
printf '# P10 fixture\n' > README.md
git add README.md && git commit -qm initial

node "$CLI" init --name 'P10 Production E2E' --json > "$EVIDENCE/init.json"
mkdir -p docs src
printf '# Spec\n\nFinal design.\n' > docs/spec.md
printf '# P03\n' > docs/p03.md
printf '# CONTEXT\n\nArchive context.\n' > docs/context.md
printf '# ADR\n\nArchive decision.\n' > docs/adr.md
printf '# Evidence\n\nReviewed.\n' > docs/evidence.md
CHANGE=$(node "$CLI" change open 'P10 archive close' --json | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).data.changeId))')
node "$CLI" artifact register docs/spec.md --type spec --id SPEC-001 --change "$CHANGE" --json >/dev/null
node "$CLI" artifact register docs/p03.md --type ticket --id P03 --change "$CHANGE" --json >/dev/null
node "$CLI" artifact register docs/context.md --type context --id CTX-001 --json >/dev/null
node "$CLI" artifact register docs/adr.md --type adr --id ADR-001 --json >/dev/null
node "$CLI" artifact register docs/evidence.md --type evidence --id EVID-001 --json >/dev/null
node "$CLI" relation add P03 domain_context CTX-001 --routing required --json >/dev/null
node "$CLI" relation add P03 governed_by ADR-001 --routing required --json >/dev/null
node "$CLI" relation add P03 evidence EVID-001 --routing required --json >/dev/null
git add . && git commit -qm 'prepare archive authorities'
BASE=$(git rev-parse HEAD)
node "$CLI" work bind P03 --source p10-production --json > "$EVIDENCE/bind.json"
printf 'export const archived = true;\n' > src/impl.ts
git add src/impl.ts && git commit -qm 'implement P03'
FINAL_REV=$(git rev-parse HEAD)

# Seed verified Work evidence deterministically; this script is testing Archive, not the Evidence provider.
ROOT_ENV="$ROOT" REPO_ENV="$REPO" EVIDENCE_ENV="$EVIDENCE" BASE_ENV="$BASE" HEAD_ENV="$FINAL_REV" node --input-type=module <<'NODE'
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import fs from 'node:fs';
const root=process.env.ROOT_ENV, repo=process.env.REPO_ENV, base=process.env.BASE_ENV, head=process.env.HEAD_ENV, evidence=process.env.EVIDENCE_ENV;
const bind=JSON.parse(fs.readFileSync(join(evidence,'bind.json'),'utf8')).data.binding;
const mod=await import(pathToFileURL(join(root,'dist','adapters','storage','sqlite-runtime-store','sqlite-runtime-store.js')).href);
const runtime=new mod.SqliteRuntimeStore(repo,()=>new Date().toISOString()); await runtime.initialize();
const pass={status:'PASS',source:'p10-production'};
await runtime.savePendingReconcile({workId:bind.workId,baseRevision:base,currentRevision:head,changedFiles:['src/impl.ts'],evidence:{tests:pass,review:pass,completion:pass},knowledgeImpact:'N0',actions:['AUTO'],updatedAt:new Date().toISOString()});
NODE
node "$CLI" reconcile --change "$CHANGE" --json > "$EVIDENCE/change-close.json"
json_assert "$EVIDENCE/change-close.json" 'j.ok===true && j.data.status==="CLOSED" && j.data.snapshot.baselines[0].revision.length>=40'

# Make a later unmanaged commit. Archive must still materialize the Final Snapshot revision above.
printf "export const archived = 'later';\n" > src/impl.ts
printf '# Spec\n\nLater unmanaged edit.\n' > docs/spec.md
git add src/impl.ts docs/spec.md && git commit -qm 'post-project unmanaged change'

node "$CLI" archive --json > "$EVIDENCE/archive.json"
json_assert "$EVIDENCE/archive.json" 'j.ok===true && j.data.status==="complete" && j.data.verified===true && j.data.revision!==undefined'
ARCHIVE_PATH=$(json_field "$EVIDENCE/archive.json" 'j.data.archive_path')
ARCHIVE_REV=$(json_field "$EVIDENCE/archive.json" 'j.data.revision')
[ "$ARCHIVE_REV" = "$FINAL_REV" ] || fail "Archive used current HEAD instead of Final Snapshot revision"
grep -q "export const archived = true;" "$ARCHIVE_PATH/source/snapshot/src/impl.ts" || fail "Final source snapshot is not pinned to final revision"
grep -q "Final design" "$ARCHIVE_PATH/artifacts/spec/SPEC-001.md" || fail "Spec was not materialized from final revision"
node "$CLI" archive verify "$ARCHIVE_PATH" --json > "$EVIDENCE/archive-verify.json"
json_assert "$EVIDENCE/archive-verify.json" 'j.ok===true && j.data.checked_files>0'

# Preserve a standalone copy before mutating the live project's artifact graph.
cp -R "$ARCHIVE_PATH" "$STANDALONE"

# Optional full history must be restorable as a Git repository.
node "$CLI" archive --with-history --json > "$EVIDENCE/archive-history.json"
HISTORY_PATH=$(json_field "$EVIDENCE/archive-history.json" 'j.data.archive_path')
[ -f "$HISTORY_PATH/source/history.bundle" ] || fail "history.bundle missing"
git clone -q "$HISTORY_PATH/source/history.bundle" "$RESTORED"
[ "$(git -C "$RESTORED" cat-file -t "$FINAL_REV")" = "commit" ] || fail "history bundle cannot restore final revision"

# A required ArtifactRef absent from the Final Snapshot must fail closed unless explicitly allowed.
ROOT_ENV="$ROOT" REPO_ENV="$REPO" node --input-type=module <<'NODE'
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const root=process.env.ROOT_ENV, repo=process.env.REPO_ENV;
const mod=await import(pathToFileURL(join(root,'dist','adapters','storage','yaml-project-store','yaml-project-store.js')).href);
const store=new mod.YamlProjectStore(repo);
await store.saveArtifact({schemaVersion:1,artifactId:'SPEC-MISSING',type:'spec',authority:'git-file',locator:'docs/never-existed.md',title:'Missing Spec'});
NODE
set +e
node "$CLI" archive --json > "$EVIDENCE/archive-incomplete-rejected.json"
code=$?
set -e
[ "$code" -eq 2 ] || fail "incomplete archive should fail closed by default"
json_assert "$EVIDENCE/archive-incomplete-rejected.json" 'j.ok===false && j.error.code==="CONTINUUM_ARCHIVE_INCOMPLETE"'
node "$CLI" archive --allow-incomplete --json > "$EVIDENCE/archive-incomplete.json"
json_assert "$EVIDENCE/archive-incomplete.json" 'j.ok===true && j.data.status==="incomplete"'

# Archive must remain verifiable without the original repository.
rm -rf "$REPO"
cd "$EVIDENCE"
node "$CLI" archive verify "$STANDALONE" --json > "$EVIDENCE/standalone-verify.json"
json_assert "$EVIDENCE/standalone-verify.json" 'j.ok===true && j.data.checked_files>0'

# Integrity check must detect tampering.
cp -R "$STANDALONE" "$TAMPERED"
printf 'tampered\n' > "$TAMPERED/artifacts/spec/SPEC-001.md"
set +e
node "$CLI" archive verify "$TAMPERED" --json > "$EVIDENCE/tamper-verify.json"
code=$?
set -e
[ "$code" -eq 2 ] || fail "tampered archive should fail verification"
json_assert "$EVIDENCE/tamper-verify.json" 'j.ok===false && j.data.failures.some(x=>x.includes("Checksum mismatch"))'

echo "P10 PRODUCTION VERIFY: PASS"
echo "Evidence: $EVIDENCE"
