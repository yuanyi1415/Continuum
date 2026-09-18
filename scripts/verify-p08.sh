#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -ne 24 ]; then
  echo "FAIL: P08 production verification requires Node.js 24 LTS; found $(node --version)" >&2
  exit 2
fi
command -v omp >/dev/null 2>&1 || { echo "FAIL: omp executable not found" >&2; exit 2; }

EVIDENCE="${TMPDIR:-/tmp}/continuum-p08-production-e2e"
rm -rf "$EVIDENCE"
mkdir -p "$EVIDENCE"
OMP_TRACE="$EVIDENCE/omp-events.jsonl"
: > "$OMP_TRACE"

printf 'node=%s\n' "$(node --version)" | tee "$EVIDENCE/environment.txt"
printf 'npm=%s\n' "$(npm --version)" | tee -a "$EVIDENCE/environment.txt"
printf 'git=%s\n' "$(git --version)" | tee -a "$EVIDENCE/environment.txt"
printf 'omp=%s\n' "$(omp --version)" | tee -a "$EVIDENCE/environment.txt"

npm install
npm run test:p08 | tee "$EVIDENCE/tests-p08.txt"
npm run test:p07 | tee "$EVIDENCE/tests-p07-regression.txt"
npm run test:p05 | tee "$EVIDENCE/tests-p05-regression.txt"
npm run test:p03 | tee "$EVIDENCE/tests-p03-regression.txt"
npm run compile

SOURCE="$EVIDENCE/source"
mkdir -p "$SOURCE/docs"
git -C "$SOURCE" init -q -b main
git -C "$SOURCE" config user.email continuum-e2e@example.com
git -C "$SOURCE" config user.name "Continuum E2E"
cat > "$SOURCE/README.md" <<'EOF'
# P08 production fixture

This repository exists only to verify the Continuum OMP adapter lifecycle.
EOF
cat > "$SOURCE/CONTEXT.md" <<'EOF'
# Domain Context

This fixture validates Continuum project/work continuity. Do not invent additional product requirements.
EOF
cat > "$SOURCE/docs/spec.md" <<'EOF'
# User Memory Spec

Goal: verify that OMP can bind, resume, suppress, and checkpoint a Continuum-managed Work.
EOF
cat > "$SOURCE/docs/p03.md" <<'EOF'
# P03 Runtime Read

Objective: validate the P03 Work Binding lifecycle only.
Acceptance: Continuum binds P03, preserves the Work Baseline, and resumes it across sessions.
No implementation work is required from the model during lifecycle probes.
EOF
git -C "$SOURCE" add .
git -C "$SOURCE" commit -qm initial

run_json() { (cd "$SOURCE" && node "$ROOT/dist/cli/index.js" "$@" --json); }

# OMP lifecycle verification must assert Continuum state, not model response latency.
# The model/provider may time out after session_start/before_agent_start already fired.
run_omp_probe() {
  local cwd="$1"
  local logfile="$2"
  local prompt="$3"
  local tmp="${logfile}.tmp"
  local rc=0
  set +e
  (
    cd "$cwd"
    CONTINUUM_CLI_ENTRY="$ROOT/dist/cli/index.js" \
    CONTINUUM_OMP_TRACE_FILE="$OMP_TRACE" \
    omp -p --no-tools --max-time=15 "$prompt"
  ) >"$tmp" 2>&1
  rc=$?
  set -e
  cat "$tmp" | tee "$logfile"
  rm -f "$tmp"
  if [ "$rc" -ne 0 ]; then
    printf 'WARN: OMP model process exited rc=%s; continuing with lifecycle/state assertions.\n' "$rc" | tee -a "$logfile"
  fi
  return 0
}

run_json init --name "P08 Production E2E" | tee "$EVIDENCE/init.json"
CHANGE_ID="$(run_json change open '用户 Memory' --intent 'OMP native adapter verification' | tee "$EVIDENCE/change-open.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).data.changeId))')"
run_json artifact register docs/spec.md --type spec --id SPEC-001 --change "$CHANGE_ID" | tee "$EVIDENCE/register-spec.json"
run_json artifact register docs/p03.md --type ticket --id P03 --change "$CHANGE_ID" | tee "$EVIDENCE/register-ticket.json"
run_json artifact register CONTEXT.md --type context --id CONTEXT | tee "$EVIDENCE/register-context.json"
run_json relation add P03 belongs_to SPEC-001 | tee "$EVIDENCE/relation-spec.json"
run_json relation add P03 domain_context CONTEXT | tee "$EVIDENCE/relation-context.json"
git -C "$SOURCE" add .
git -C "$SOURCE" commit -qm 'prepare continuum graph'

run_json host install omp | tee "$EVIDENCE/host-install-omp.json"
if [ ! -f "$SOURCE/.omp/extensions/continuum.ts" ]; then
  echo "FAIL: OMP project extension was not installed" >&2
  exit 3
fi
if grep -q 'setStatus(' "$SOURCE/.omp/extensions/continuum.ts"; then
  echo "FAIL: OMP adapter must not install a second Continuum status-line surface" >&2
  exit 3
fi
if ! grep -q 'setWidget(WIDGET_KEY' "$SOURCE/.omp/extensions/continuum.ts"; then
  echo "FAIL: OMP adapter does not contain the single ambient widget" >&2
  exit 3
fi
git -C "$SOURCE" add .omp AGENTS.md .continuum .gitignore
git -C "$SOURCE" commit -qm 'install continuum omp adapter'
BASELINE="$(git -C "$SOURCE" rev-parse HEAD)"
printf '%s\n' "$BASELINE" > "$EVIDENCE/work-baseline.txt"

# 1) Ad-hoc OMP work must not bind Continuum.
run_omp_probe "$SOURCE" "$EVIDENCE/omp-adhoc.txt" "Explain docs/p03.md briefly. Do not modify files."
run_json work current | tee "$EVIDENCE/work-after-adhoc.json"
node - "$EVIDENCE/work-after-adhoc.json" <<'NODE'
const fs=require('fs'); const work=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
if(work.mode!=='aware'||work.binding!==null) throw new Error('OMP ad-hoc prompt unexpectedly bound formal Work');
NODE

# 2) Explicit intent must bind P03 and freeze the adapter-committed baseline.
run_omp_probe "$SOURCE" "$EVIDENCE/omp-bind.txt" "implement P03; do not modify files"
run_json work current | tee "$EVIDENCE/work-after-bind.json"
if ! node - "$EVIDENCE/work-after-bind.json" "$BASELINE" <<'NODE'
const fs=require('fs'); const work=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data; const baseline=process.argv[3];
if(work.mode!=='managed'||work.binding?.targetArtifactId!=='P03') process.exit(10);
if(work.binding?.workStartRevision!==baseline) process.exit(11);
NODE
then
  echo "FAIL: OMP explicit intent did not bind P03" >&2
  echo "--- OMP lifecycle trace ---" >&2
  cat "$OMP_TRACE" >&2 || true
  if grep -q '"error":' "$OMP_TRACE"; then
    echo "DIAGNOSIS: OMP extension fired, but its Continuum CLI invocation failed. Inspect the trace error above." >&2
  elif ! grep -q '"event_name":"before_agent_start"' "$OMP_TRACE"; then
    echo "DIAGNOSIS: project OMP extension did not emit before_agent_start; check extension discovery/load errors above." >&2
    echo "--- explicit-extension diagnostic ---" >&2
    (cd "$SOURCE" && CONTINUUM_CLI_ENTRY="$ROOT/dist/cli/index.js" CONTINUUM_OMP_TRACE_FILE="$OMP_TRACE.explicit" omp -p --no-tools --extension "$SOURCE/.omp/extensions/continuum.ts" --max-time=60 "implement P03; do not modify files") 2>&1 | tee "$EVIDENCE/omp-bind-explicit-extension.txt" >&2 || true
  elif ! grep -q '"targetArtifactId":"P03"' "$OMP_TRACE"; then
    echo "DIAGNOSIS: OMP extension fired, but transformed prompt did not produce P03 binding. Raw trace is above." >&2
  fi
  exit 4
fi

# 3) A fresh OMP session must resume the worktree binding without moving baseline.
run_omp_probe "$SOURCE" "$EVIDENCE/omp-resume.txt" "Continue the current managed work context. Do not modify files."
run_json work current | tee "$EVIDENCE/work-after-resume.json"
node - "$EVIDENCE/work-after-resume.json" "$BASELINE" <<'NODE'
const fs=require('fs'); const work=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data; const baseline=process.argv[3];
if(work.binding?.targetArtifactId!=='P03'||work.binding?.workStartRevision!==baseline) throw new Error('Fresh OMP session did not resume the same P03 Work Baseline');
NODE

# 4) Real code change + fresh OMP settle must produce one pending reconcile candidate.
printf 'export const p08 = true;\n' > "$SOURCE/implementation.ts"
git -C "$SOURCE" add implementation.ts
git -C "$SOURCE" commit -qm 'implement P03 fixture change'
IMPL_REV="$(git -C "$SOURCE" rev-parse HEAD)"
run_omp_probe "$SOURCE" "$EVIDENCE/omp-checkpoint.txt" "Review the current managed work state without changing files."
run_json reconcile | tee "$EVIDENCE/reconcile-after-omp.json"
node - "$SOURCE/.continuum-local/runtime.db" "$BASELINE" "$IMPL_REV" <<'NODE'
const DB=require('better-sqlite3'); const db=new DB(process.argv[2]);
const rows=db.prepare('SELECT * FROM pending_reconciles WHERE work_id IN (SELECT work_id FROM worktree_bindings)').all(); db.close();
if(rows.length!==1) throw new Error(`expected exactly one pending Work Reconcile, got ${rows.length}`);
const row=rows[0]; if(row.base_revision!==process.argv[3]) throw new Error('pending candidate base revision moved');
if(row.current_revision!==process.argv[4]) throw new Error('pending candidate current revision mismatch');
NODE

# 5) Session suppression must remain local; use the latest real OMP session id, then start another session.
OMP_SESSION="$(node - "$SOURCE/.continuum-local/runtime.db" <<'NODE'
const DB=require('better-sqlite3'); const db=new DB(process.argv[2]); const row=db.prepare("SELECT session_id FROM session_bindings WHERE host='omp' ORDER BY bound_at DESC LIMIT 1").get(); db.close(); if(!row) process.exit(2); console.log(row.session_id);
NODE
)"
run_json work suppress-session --session "$OMP_SESSION" --host omp --reason production-verification | tee "$EVIDENCE/suppress-session.json"
run_omp_probe "$SOURCE" "$EVIDENCE/omp-after-suppression.txt" "Continue current project context without modifying files."
run_json work current | tee "$EVIDENCE/work-after-suppression.json"
node - "$EVIDENCE/work-after-suppression.json" <<'NODE'
const fs=require('fs'); const work=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
if(work.mode!=='managed'||work.binding?.targetArtifactId!=='P03') throw new Error('session suppression destroyed worktree continuity');
NODE

# 6) Cross-host continuity: bind via Codex lifecycle in a separate repo and resume with real OMP.
CROSS="$EVIDENCE/cross-host"
mkdir -p "$CROSS/docs"
git -C "$CROSS" init -q -b main
git -C "$CROSS" config user.email continuum-e2e@example.com
git -C "$CROSS" config user.name "Continuum E2E"
cat > "$CROSS/README.md" <<'EOF'
# Cross-host lifecycle fixture
EOF
cat > "$CROSS/CONTEXT.md" <<'EOF'
# Context

This fixture only verifies Codex-to-OMP Continuum Work continuity.
EOF
cat > "$CROSS/docs/spec.md" <<'EOF'
# Spec

Goal: preserve the same P03 Work Binding while switching hosts.
EOF
cat > "$CROSS/docs/p03.md" <<'EOF'
# P03

Acceptance: OMP resumes the P03 binding created by Codex without moving the Work Baseline.
No implementation work is required from the model.
EOF
git -C "$CROSS" add .; git -C "$CROSS" commit -qm initial
run_cross(){ (cd "$CROSS" && node "$ROOT/dist/cli/index.js" "$@" --json); }
run_cross init --name "P08 Cross Host" >/dev/null
CROSS_CHANGE="$(run_cross change open 'Cross Host Change' | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).data.changeId))')"
run_cross artifact register docs/spec.md --type spec --id SPEC-001 --change "$CROSS_CHANGE" >/dev/null
run_cross artifact register docs/p03.md --type ticket --id P03 --change "$CROSS_CHANGE" >/dev/null
run_cross artifact register CONTEXT.md --type context --id CONTEXT >/dev/null
run_cross relation add P03 belongs_to SPEC-001 >/dev/null; run_cross relation add P03 domain_context CONTEXT >/dev/null
run_cross host install omp >/dev/null
git -C "$CROSS" add .; git -C "$CROSS" commit -qm 'prepare cross host fixture'
(cd "$CROSS" && printf '%s' '{"hook_event_name":"UserPromptSubmit","session_id":"codex-cross","cwd":"'"$CROSS"'","prompt":"/implement P03"}' | node "$ROOT/dist/cli/index.js" host codex hook > "$EVIDENCE/codex-bind-response.json")
run_omp_probe "$CROSS" "$EVIDENCE/omp-cross-host-resume.txt" "Continue the current work without changing files."
run_cross work current | tee "$EVIDENCE/cross-host-work.json"
node - "$EVIDENCE/cross-host-work.json" "$CROSS/.continuum-local/runtime.db" <<'NODE'
const fs=require('fs'); const DB=require('better-sqlite3'); const work=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
if(work.binding?.targetArtifactId!=='P03') throw new Error('OMP did not resume Codex-bound P03');
const db=new DB(process.argv[3]); const row=db.prepare("SELECT session_id FROM session_bindings WHERE host='omp' ORDER BY bound_at DESC LIMIT 1").get(); db.close(); if(!row) throw new Error('fresh OMP session did not register cross-host resume');
NODE

printf 'PASS\n' | tee "$EVIDENCE/result.txt"
echo "P08_EVIDENCE=$EVIDENCE"
echo "Next: run ./scripts/verify-p08-omp-ui.sh for the interactive TUI acceptance." 
