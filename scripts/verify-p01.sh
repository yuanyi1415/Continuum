#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -ne 24 ]; then
  echo "FAIL: P01 production verification requires Node.js 24 LTS; found $(node --version)" >&2
  exit 2
fi

EVIDENCE="${TMPDIR:-/tmp}/continuum-p01-production-e2e"
rm -rf "$EVIDENCE"
mkdir -p "$EVIDENCE"

printf 'node=%s\n' "$(node --version)" | tee "$EVIDENCE/environment.txt"
printf 'npm=%s\n' "$(npm --version)" | tee -a "$EVIDENCE/environment.txt"
printf 'git=%s\n' "$(git --version)" | tee -a "$EVIDENCE/environment.txt"

npm install
npm run test:p01 | tee "$EVIDENCE/tests.txt"
npm run build

FIXTURE="$EVIDENCE/fixture"
SOURCE="$FIXTURE/source"
CLONE="$FIXTURE/clone"
mkdir -p "$SOURCE"
git -C "$SOURCE" init -q -b main
git -C "$SOURCE" config user.email continuum-e2e@example.com
git -C "$SOURCE" config user.name "Continuum E2E"
printf '# P01 production fixture\n' > "$SOURCE/README.md"
git -C "$SOURCE" add README.md
git -C "$SOURCE" commit -qm initial

(
  cd "$SOURCE"
  node "$ROOT/dist/cli/index.js" init --name "P01 Production E2E" --json | tee "$EVIDENCE/init.json"
  node "$ROOT/dist/cli/index.js" status --json | tee "$EVIDENCE/source-status.json"
  node "$ROOT/dist/cli/index.js" doctor --json | tee "$EVIDENCE/source-doctor.json"
)

if ! grep -q '"driver": "better-sqlite3"' "$EVIDENCE/source-status.json"; then
  echo "FAIL: production verification did not use better-sqlite3" >&2
  exit 3
fi

git -C "$SOURCE" add .continuum .gitignore
git -C "$SOURCE" commit -qm 'initialize continuum'
git clone -q "$SOURCE" "$CLONE"
(
  cd "$CLONE"
  node "$ROOT/dist/cli/index.js" status --json | tee "$EVIDENCE/clone-status.json"
  node "$ROOT/dist/cli/index.js" doctor --json | tee "$EVIDENCE/clone-doctor.json"
)

if [ -e "$CLONE/.continuum-local/runtime.db" ]; then
  echo "FAIL: runtime.db crossed clone boundary" >&2
  exit 4
fi

if git -C "$CLONE" ls-files '.continuum-local/**' | grep -q .; then
  echo "FAIL: .continuum-local contains tracked files" >&2
  exit 5
fi

printf 'PASS\n' | tee "$EVIDENCE/result.txt"
echo "P01_EVIDENCE=$EVIDENCE"
