#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVIDENCE="${TMPDIR:-/tmp}/continuum-p11-production-e2e"
REPO="$EVIDENCE/repo"
NONPROJECT="$EVIDENCE/nonproject"
FAKEBIN="$EVIDENCE/fake-bin"
CODEX_HOME="$EVIDENCE/codex-home"
OMP_AGENT="$EVIDENCE/omp-agent"
CLI="$ROOT/dist/cli/index.js"

fail(){ echo "P11 VERIFY FAIL: $*" >&2; exit 1; }
json_assert(){ node - "$1" "$2" <<'NODE'
const fs=require('fs'); const [path,expr]=process.argv.slice(2); const j=JSON.parse(fs.readFileSync(path,'utf8')); const fn=new Function('j',`return (${expr})`); if(!fn(j)){console.error(JSON.stringify(j,null,2)); process.exit(1)}
NODE
}

if [ "${CONTINUUM_VERIFY_ALLOW_UNSUPPORTED_NODE:-0}" != "1" ]; then
  node -e 'if(Number(process.versions.node.split(".")[0])!==24) process.exit(2)' || fail "Node 24 is required"
fi
command -v git >/dev/null || fail "git not found"
if [ ! -f "$CLI" ]; then
  echo "Building Continuum P11..."
  (cd "$ROOT" && npm install && npm run compile)
fi

rm -rf "$EVIDENCE"
mkdir -p "$REPO" "$NONPROJECT" "$FAKEBIN" "$CODEX_HOME" "$OMP_AGENT"

cat > "$FAKEBIN/codex" <<'SH'
#!/usr/bin/env bash
set -e
STATE="${CONTINUUM_FAKE_CODEX_STATE:?}"
case "${1:-}" in
  --version) echo 'codex-cli 0.154.0';;
  --help) echo 'Codex help hooks mcp dangerously-bypass-hook-trust';;
  mcp)
    case "${2:-}" in
      --help) echo 'mcp add get';;
      get) [ -f "$STATE" ] && { echo continuum; exit 0; } || exit 1;;
      add) touch "$STATE"; echo added;;
      *) exit 1;;
    esac;;
  *) exit 1;;
esac
SH
chmod +x "$FAKEBIN/codex"

cat > "$FAKEBIN/omp" <<'SH'
#!/usr/bin/env bash
case "${1:-}" in
  --version) echo 'omp/18.2.1';;
  --help) echo '--extension <path> --hook <path> --print';;
  *) exit 1;;
esac
SH
chmod +x "$FAKEBIN/omp"

export PATH="$FAKEBIN:$PATH"
export CODEX_HOME
export PI_CODING_AGENT_DIR="$OMP_AGENT"
export CONTINUUM_FAKE_CODEX_STATE="$EVIDENCE/codex-mcp.state"

cd "$NONPROJECT"
node "$CLI" setup --json > "$EVIDENCE/setup.json"
json_assert "$EVIDENCE/setup.json" 'j.ok===true && j.data.scope==="user" && j.data.hosts.codex.status==="installed" && j.data.hosts.omp.status==="installed"'
[ -f "$CODEX_HOME/hooks.json" ] || fail "global Codex hooks.json missing"
[ -f "$CODEX_HOME/config.toml" ] || fail "global Codex config.toml missing"
[ -f "$OMP_AGENT/extensions/continuum.ts" ] || fail "global OMP extension missing"
grep -q 'host codex hook --global' "$CODEX_HOME/hooks.json" || fail "Codex global hook command missing"
grep -q 'BRIDGE_SCOPE:"global"' "$OMP_AGENT/extensions/continuum.ts" || fail "OMP extension is not global bridge asset"

node "$CLI" doctor --global --json > "$EVIDENCE/global-doctor.json"
json_assert "$EVIDENCE/global-doctor.json" 'j.ok===true && j.data.hosts.every(x=>x.level==="PASS")'

# Global bridges must stay silent outside opt-in projects.
printf '%s' '{"hook_event_name":"SessionStart","session_id":"c0","cwd":"'"$NONPROJECT"'"}' | node "$CLI" host codex hook --global > "$EVIDENCE/nonproject-codex.json"
json_assert "$EVIDENCE/nonproject-codex.json" 'j.continue===true && j.suppressOutput===true'
printf '%s' '{"event_name":"session_start","session_id":"o0","cwd":"'"$NONPROJECT"'"}' | node "$CLI" host omp event --global > "$EVIDENCE/nonproject-omp.json"
json_assert "$EVIDENCE/nonproject-omp.json" 'j.state==="SILENT"'

cd "$REPO"
git init -q
git config user.email continuum-p11@example.com
git config user.name 'Continuum P11'
printf '# P11 fixture\n' > README.md
git add README.md && git commit -qm initial
node "$CLI" init --name 'P11 Global Bridge E2E' --json > "$EVIDENCE/init.json"
[ ! -e "$REPO/.codex" ] || fail "project-local Codex adapter should not be required"
[ ! -e "$REPO/.omp" ] || fail "project-local OMP adapter should not be required"

mkdir -p docs
printf '# P03\n' > docs/p03.md
CHANGE=$(node "$CLI" change open 'P11 global host' --json | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).data.changeId))')
node "$CLI" artifact register docs/p03.md --type ticket --id P03 --change "$CHANGE" --json >/dev/null
git add . && git commit -qm 'prepare P11 ticket'

# Codex global Hook drives lifecycle without a repository .codex adapter.
printf '%s' '{"hook_event_name":"UserPromptSubmit","session_id":"c1","cwd":"'"$REPO"'","prompt":"implement P03"}' | node "$CLI" host codex hook --global > "$EVIDENCE/codex-bind.json"
json_assert "$EVIDENCE/codex-bind.json" 'j.continue===true && j.hookSpecificOutput.additionalContext.includes("Managed Work P03")'
node "$CLI" work current --json > "$EVIDENCE/work.json"
json_assert "$EVIDENCE/work.json" 'j.data.mode==="managed" && j.data.binding.targetArtifactId==="P03"'

# OMP global Extension event resumes the same worktree binding cross-host.
printf '%s' '{"event_name":"session_start","session_id":"o1","cwd":"'"$REPO"'"}' | node "$CLI" host omp event --global > "$EVIDENCE/omp-resume.json"
json_assert "$EVIDENCE/omp-resume.json" 'j.state==="MANAGED" && j.targetArtifactId==="P03"'

# Agent-facing tools are shipped by both global host surfaces.
grep -q "continuum_init" "$ROOT/runtime-assets/codex-mcp-server.mjs" || fail "Codex continuum_init MCP tool missing"
grep -q 'name:"continuum_init"' "$ROOT/runtime-assets/omp-extension.ts" || fail "OMP continuum_init tool missing"

node "$CLI" host doctor --json > "$EVIDENCE/project-host-doctor.json"
json_assert "$EVIDENCE/project-host-doctor.json" 'j.ok===true && j.data.every(x=>x.adapterPresent===true)'

echo "P11 PRODUCTION VERIFY: PASS"
echo "Evidence: $EVIDENCE"
