#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVIDENCE="${TMPDIR:-/tmp}/continuum-p07-production-e2e"
SOURCE="$EVIDENCE/fixture/source"
[ -d "$SOURCE/.continuum" ] || { echo "Run ./scripts/verify-p07.sh first." >&2; exit 2; }
command -v codex >/dev/null 2>&1 || { echo "codex not found" >&2; exit 2; }

# Ensure there is one pending DECISION for the real structured UI path.
node - "$SOURCE/.continuum-local/runtime.db" <<'NODE'
const DB=require('better-sqlite3'); const db=new DB(process.argv[2]);
db.prepare("UPDATE pending_interactions SET status='resolved', resolved_at=? WHERE status='pending'").run(new Date().toISOString());
const req={id:'int_p07_gui',type:'DECISION',title:'这项正式工作应该归到哪里？',message:'Continuum 检测到多个可能的 Change 归属，请由你选择。',options:[{id:'create',label:'新建 Change「用户 Memory」'},{id:'memory-architecture',label:'Memory Architecture'},{id:'adhoc',label:'保持临时工作'}],blocking:true,createdAt:new Date().toISOString()};
db.prepare("INSERT OR REPLACE INTO pending_interactions(interaction_id,type,payload_json,status,created_at,resolved_at) VALUES(?,?,?,?,?,NULL)").run(req.id,req.type,JSON.stringify(req),'pending',req.createdAt); db.close();
NODE

codex mcp remove continuum-p07-verify >/dev/null 2>&1 || true
codex mcp add continuum-p07-verify -- node "$ROOT/runtime-assets/codex-mcp-server.mjs" "$ROOT/dist/cli/index.js" >/dev/null
cleanup(){ codex mcp remove continuum-p07-verify >/dev/null 2>&1 || true; }
trap cleanup EXIT

cat <<'EOF'

=== P07 Codex GUI structured decision verification ===

Codex Desktop 打开后发送：

continuum decision

预期：
1. Hook 不再用文本 Gate 阻断这条特殊决策请求；
2. Agent 调用 MCP tool `continuum_decision`；
3. Codex 显示原生 structured elicitation；
4. 你自己选择任意一项并确认；
5. 不允许 Agent 替你选择。

完成选择后回到这个终端按 Enter。
EOF

ENCODED="$(python3 - "$SOURCE" <<'PY'
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=''))
PY
)"
URL="codex://threads/new?path=$ENCODED"
if command -v open >/dev/null 2>&1; then
  open -b com.openai.codex "$URL" 2>/dev/null || codex app "$SOURCE"
else
  codex app "$SOURCE"
fi
read -r -p "完成 Codex 表单选择后按 Enter 验证... " _

node - "$SOURCE/.continuum-local/runtime.db" <<'NODE'
const DB=require('better-sqlite3'); const db=new DB(process.argv[2]); const row=db.prepare("SELECT status,resolved_at FROM pending_interactions WHERE interaction_id='int_p07_gui'").get(); db.close();
if(!row||row.status!=='resolved'||!row.resolved_at) throw new Error(`MCP decision was not resolved: ${JSON.stringify(row)}`);
NODE

echo "PASS: Codex MCP structured DECISION resolved through the real GUI."
