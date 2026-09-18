#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
GLOBAL_ROOT="$(npm root -g)"
PREFIX="$(npm prefix -g)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" != "24" ]; then
  echo "Continuum requires Node.js 24 LTS. Current: $(node --version)" >&2
  exit 2
fi

git --version >/dev/null

npm uninstall -g @continuum-ai/continuum >/dev/null 2>&1 || true
rm -rf "$GLOBAL_ROOT/@continuum-ai/continuum"
rm -f "$PREFIX/bin/continuum"

PACKAGE="$(cd "$ROOT" && npm pack --silent --pack-destination "$TMP" | tail -n 1)"
npm install -g "$TMP/$PACKAGE"

echo
continuum --version
echo "Continuum installed successfully."
