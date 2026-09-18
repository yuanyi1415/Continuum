#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -ne 24 ]; then
  echo "FAIL: P03 production verification requires Node.js 24 LTS; found $(node --version)" >&2
  exit 2
fi

EVIDENCE="${TMPDIR:-/tmp}/continuum-p03-production-e2e"
rm -rf "$EVIDENCE"
mkdir -p "$EVIDENCE"

printf 'node=%s\n' "$(node --version)" | tee "$EVIDENCE/environment.txt"
printf 'npm=%s\n' "$(npm --version)" | tee -a "$EVIDENCE/environment.txt"
printf 'git=%s\n' "$(git --version)" | tee -a "$EVIDENCE/environment.txt"

npm install
npm run test:p03 | tee "$EVIDENCE/tests-p03.txt"
npm run test:p02 | tee "$EVIDENCE/tests-p02-regression.txt"
npm run test:p01 | tee "$EVIDENCE/tests-p01-regression.txt"
npm run build

FIXTURE="$EVIDENCE/fixture"
SOURCE="$FIXTURE/source"
CLONE="$FIXTURE/clone"
mkdir -p "$SOURCE/docs"
git -C "$SOURCE" init -q -b main
git -C "$SOURCE" config user.email continuum-e2e@example.com
git -C "$SOURCE" config user.name "Continuum E2E"
printf '# P03 production fixture\n' > "$SOURCE/README.md"
printf '# P03 Work Binding\n' > "$SOURCE/docs/p03.md"
git -C "$SOURCE" add README.md docs
git -C "$SOURCE" commit -qm initial

run_json() {
  (cd "$SOURCE" && node "$ROOT/dist/cli/index.js" "$@" --json)
}

run_json init --name "P03 Production E2E" | tee "$EVIDENCE/init.json"
CHANGE_ID="$(run_json change open 'Work Binding' --intent 'Cross-agent worktree continuity' | tee "$EVIDENCE/change-open.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).data.changeId))')"
run_json artifact register docs/p03.md --type ticket --id P03 --title "Work Binding" --change "$CHANGE_ID" | tee "$EVIDENCE/register-ticket.json"

# Commit all durable project facts before formal Work starts. This revision must become Work Baseline.
git -C "$SOURCE" add .continuum .gitignore docs README.md
git -C "$SOURCE" commit -qm 'prepare p03 formal work'
BASELINE="$(git -C "$SOURCE" rev-parse HEAD)"
printf '%s\n' "$BASELINE" > "$EVIDENCE/work-baseline.txt"

run_json work bind P03 --session codex-1 --host codex --source production-e2e | tee "$EVIDENCE/bind.json"
run_json work current --session omp-1 --host omp | tee "$EVIDENCE/omp-resume.json"
run_json status | tee "$EVIDENCE/status-managed.json"

# A real implementation commit must not move Work Baseline.
printf 'implementation after formal binding\n' > "$SOURCE/implementation.txt"
git -C "$SOURCE" add implementation.txt
git -C "$SOURCE" commit -qm 'implementation after p03 binding'
CURRENT="$(git -C "$SOURCE" rev-parse HEAD)"
printf '%s\n' "$CURRENT" > "$EVIDENCE/current-revision.txt"
run_json work bind P03 --source production-e2e | tee "$EVIDENCE/rebind.json"
run_json work current --session codex-2 --host codex | tee "$EVIDENCE/codex-resume.json"

# Suppression must be session-local only.
run_json work suppress-session --session omp-1 --host omp --reason 'temporary ad-hoc question' | tee "$EVIDENCE/suppress.json"
run_json work current --session omp-1 --host omp | tee "$EVIDENCE/omp-suppressed.json"
run_json work current --session omp-2 --host omp | tee "$EVIDENCE/omp-fresh-resume.json"

node - "$EVIDENCE/bind.json" "$EVIDENCE/rebind.json" "$EVIDENCE/omp-resume.json" "$EVIDENCE/codex-resume.json" "$EVIDENCE/omp-suppressed.json" "$EVIDENCE/omp-fresh-resume.json" "$EVIDENCE/status-managed.json" "$BASELINE" "$CURRENT" <<'NODE'
const fs=require('fs');
const [bindPath,rebindPath,ompPath,codexPath,suppPath,freshPath,statusPath,baseline,current]=process.argv.slice(2);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')).data;
const bind=read(bindPath), rebind=read(rebindPath), omp=read(ompPath), codex=read(codexPath), supp=read(suppPath), fresh=read(freshPath), status=read(statusPath);
if (!bind.created) throw new Error('first Work binding was not created');
if (bind.binding.workStartRevision !== baseline) throw new Error('Work Baseline was not frozen at bind time');
if (rebind.created !== false) throw new Error('same Work rebind must be idempotent');
if (rebind.binding.workStartRevision !== baseline) throw new Error('rebind moved Work Baseline');
if (baseline === current) throw new Error('fixture failed to create post-bind implementation commit');
for (const [name,result] of [['omp',omp],['codex',codex],['fresh',fresh]]) {
  if (result.mode !== 'managed' || result.binding?.targetArtifactId !== 'P03') throw new Error(`${name} did not resume P03`);
  if (result.binding.workStartRevision !== baseline) throw new Error(`${name} observed wrong Work Baseline`);
}
if (supp.mode !== 'aware' || supp.suppressed !== true || supp.binding?.targetArtifactId !== 'P03') throw new Error('session suppression is not local');
if (status.work.mode !== 'managed' || status.work.binding?.targetArtifactId !== 'P03') throw new Error('status does not expose managed Work');
if (status.runtime.driver !== 'better-sqlite3') throw new Error(`expected better-sqlite3, got ${status.runtime.driver}`);
NODE

# Work/Session state is runtime-only; no Work Baseline may leak into durable .continuum files.
if grep -R -q "$BASELINE" "$SOURCE/.continuum"; then
  echo "FAIL: Work Baseline leaked into durable project state" >&2
  exit 3
fi
if ! test -f "$SOURCE/.continuum-local/runtime.db"; then
  echo "FAIL: runtime.db missing after Work binding" >&2
  exit 4
fi

# Runtime continuity is worktree-local and must not silently cross clone boundaries.
git -C "$SOURCE" add implementation.txt
git clone -q "$SOURCE" "$CLONE"
(
  cd "$CLONE"
  node "$ROOT/dist/cli/index.js" status --json | tee "$EVIDENCE/clone-status.json"
  node "$ROOT/dist/cli/index.js" work current --session clone-1 --host generic --json | tee "$EVIDENCE/clone-work.json"
)

node - "$EVIDENCE/clone-status.json" "$EVIDENCE/clone-work.json" <<'NODE'
const fs=require('fs');
const status=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
const work=JSON.parse(fs.readFileSync(process.argv[3],'utf8')).data;
if (status.runtime.available !== false) throw new Error('runtime state crossed clone boundary');
if (work.mode !== 'aware' || work.binding !== null) throw new Error('Worktree Binding crossed clone boundary');
NODE

if [ -e "$CLONE/.continuum-local/runtime.db" ]; then
  echo "FAIL: runtime.db crossed clone boundary" >&2
  exit 5
fi

printf 'PASS\n' | tee "$EVIDENCE/result.txt"
echo "P03_EVIDENCE=$EVIDENCE"
