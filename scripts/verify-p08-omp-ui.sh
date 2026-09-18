#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVIDENCE="${TMPDIR:-/tmp}/continuum-p08-production-e2e"
SOURCE="$EVIDENCE/source"

if [ ! -f "$ROOT/dist/cli/index.js" ]; then
  echo "Building the current P08 package for interactive verification..."
  (cd "$ROOT" && npm install && npm run build)
fi
[ -d "$SOURCE/.continuum" ] || { echo "Run ./scripts/verify-p08.sh first." >&2; exit 2; }
command -v omp >/dev/null 2>&1 || { echo "omp not found" >&2; exit 2; }

(cd "$SOURCE" && node "$ROOT/dist/cli/index.js" host install omp --json >/dev/null)
UI_TRACE="$EVIDENCE/omp-ui-events.jsonl"
: > "$UI_TRACE"

seed_interaction(){
  local kind="$1"
  node - "$SOURCE/.continuum-local/runtime.db" "$kind" "$SOURCE" <<'NODE'
const DB=require('better-sqlite3');
const cp=require('child_process');
const db=new DB(process.argv[2]); const kind=process.argv[3]; const repo=process.argv[4]; const now=new Date().toISOString();
db.prepare("UPDATE pending_interactions SET status='resolved', resolved_at=? WHERE status='pending'").run(now);
let req;
if(kind==='simple') req={id:'int_p08_simple',type:'DECISION',title:'这项工作应该归到哪里？',message:'请选择 Continuum Change 归属。',options:[{id:'create',label:'新建 Change「用户 Memory」'},{id:'existing',label:'Memory Architecture'},{id:'adhoc',label:'保持临时工作'}],blocking:true,createdAt:now};
if(kind==='heavy') req={id:'int_p08_heavy',type:'DECISION',title:'Architecture decision required',message:'Memory 写入需要新的权限边界。这个决定会长期影响项目架构，请先选择处理方式。',reason:'Architecture impact requires ADR',options:[{id:'adr',label:'返回 ADR / Architecture Decision'},{id:'active',label:'保持 Change active'}],blocking:true,createdAt:now};
if(kind==='block'){
  const binding=db.prepare('SELECT change_id FROM worktree_bindings LIMIT 1').get();
  if(!binding?.change_id) throw new Error('P03 must be bound before seeding the design-conflict fixture');
  const specVersion=cp.execFileSync('git',['rev-parse','HEAD:docs/spec.md'],{cwd:repo,encoding:'utf8'}).trim();
  req={id:'int_p08_block',type:'BLOCK',title:'P03 暂停实现：发现设计冲突',message:'当前实现与 Spec 核心假设冲突。继续实现会使代码与当前设计失去一致性。',context:{scope:'change',changeId:binding.change_id,affectedTickets:['P03'],blockPhase:'implementation',designArtifacts:[{artifactId:'SPEC-001',type:'spec',version:specVersion}]},blocking:true,createdAt:now};
}
db.prepare("INSERT OR REPLACE INTO pending_interactions(interaction_id,type,payload_json,status,created_at,resolved_at) VALUES(?,?,?,?,?,NULL)").run(req.id,req.type,JSON.stringify(req),'pending',now); db.close();
NODE
}

verify_resolved(){
  local id="$1"
  node - "$SOURCE/.continuum-local/runtime.db" "$id" <<'NODE'
const DB=require('better-sqlite3'); const db=new DB(process.argv[2]); const row=db.prepare('SELECT status,resolved_at FROM pending_interactions WHERE interaction_id=?').get(process.argv[3]); db.close(); if(!row||row.status!=='resolved'||!row.resolved_at) throw new Error(`interaction not resolved: ${JSON.stringify(row)}`);
NODE
}

cat <<'TXT'
=== P08 Oh My Pi interactive TUI verification ===

这次主要看“宿主原生交互是否自然”，不是模型回答质量。

观察原则：
- Managed Work 只显示一个 Continuum Widget。
- 简单 Decision 使用轻量 select。
- 重 Decision 使用 overlay。
- “设计冲突”只暂停当前实现，不锁死整个 Session。
- 正常用户不需要理解 BLOCK / blockPhase / resolve-block 这些内部词。
TXT

seed_interaction simple
(cd "$SOURCE" && node "$ROOT/dist/cli/index.js" work bind P03 --source p08-ui-seed --json >/dev/null)
cat <<'TXT'

[1/5] 简单 DECISION
1. 进入 OMP 后应看到单一 Widget：Continuum · P03。
2. 输入：continue
3. 应出现轻量选择器；任选一项。
4. 输入 /continuum-off，Widget 应消失。
5. /quit 退出。
TXT
(cd "$SOURCE" && CONTINUUM_CLI_ENTRY="$ROOT/dist/cli/index.js" CONTINUUM_OMP_TRACE_FILE="$UI_TRACE" omp)
verify_resolved int_p08_simple

seed_interaction heavy
cat <<'TXT'

[2/5] 重 DECISION
输入：continue
预期：出现 Architecture Decision overlay。任选一项后 /quit。
TXT
(cd "$SOURCE" && CONTINUUM_CLI_ENTRY="$ROOT/dist/cli/index.js" CONTINUUM_OMP_TRACE_FILE="$UI_TRACE" omp)
verify_resolved int_p08_heavy

# Reset stale pending interactions and ensure P03 is bound before the design-conflict scenario.
node - "$SOURCE/.continuum-local/runtime.db" <<'NODE'
const DB=require('better-sqlite3'); const db=new DB(process.argv[2]); db.prepare("UPDATE pending_interactions SET status='resolved', resolved_at=? WHERE status='pending'").run(new Date().toISOString()); db.close();
NODE
(cd "$SOURCE" && node "$ROOT/dist/cli/index.js" work bind P03 --source p08-ui-seed --json >/dev/null)
seed_interaction block

cat <<'TXT'

[3/5] 发现设计冲突 → 回到设计
1. 输入：continue
2. 应看到：P03 暂停实现：发现设计冲突。
3. 选择“回到设计处理”。
4. 输入 /continuum-status，应能正常执行，且当前没有 Managed Work。
5. /quit 退出。
TXT
(cd "$SOURCE" && CONTINUUM_CLI_ENTRY="$ROOT/dist/cli/index.js" CONTINUUM_OMP_TRACE_FILE="$UI_TRACE" omp)

node - "$SOURCE/.continuum-local/runtime.db" <<'NODE'
const DB=require('better-sqlite3'); const db=new DB(process.argv[2]);
const block=db.prepare("SELECT status,payload_json FROM pending_interactions WHERE interaction_id='int_p08_block'").get();
const binding=db.prepare('SELECT COUNT(*) AS n FROM worktree_bindings').get(); db.close();
if(!block||block.status!=='pending') throw new Error(`design conflict should remain pending after return-to-design: ${JSON.stringify(block)}`);
const payload=JSON.parse(block.payload_json); if(payload.context?.blockPhase!=='design') throw new Error(`expected design phase: ${block.payload_json}`);
if(binding.n!==0) throw new Error('return-to-design should release the current Work');
NODE

cat <<'TXT'

[4/5] 设计还没改 → P03 不能继续
1. 输入：implement P03
2. 不应出现“BLOCKED / resolve-block”工程术语。
3. 应直接提示：P03 还不能继续；相关 Spec / ADR 尚未更新。
4. Session 仍可正常使用，然后 /quit。
TXT
(cd "$SOURCE" && CONTINUUM_CLI_ENTRY="$ROOT/dist/cli/index.js" CONTINUUM_OMP_TRACE_FILE="$UI_TRACE" omp)

# Simulate the real design work having been completed and committed.
printf '\n## Design update verified by P08 UI acceptance\nThe permission boundary has been clarified before restarting P03.\n' >> "$SOURCE/docs/spec.md"
git -C "$SOURCE" add docs/spec.md
git -C "$SOURCE" commit -qm 'update P03 design before restart'
DESIGN_REV="$(git -C "$SOURCE" rev-parse HEAD)"
printf '%s\n' "$DESIGN_REV" > "$EVIDENCE/design-restart-baseline.txt"

cat <<'TXT'

[5/5] 设计已更新 → 重新开始 P03
测试脚本刚刚模拟并提交了一次 Spec 更新。
1. 输入：implement P03; do not modify files
2. 应出现：检测到相关设计已更新。
3. 选择“重新开始 P03”。
4. 应提示“已基于最新设计重新开始 P03”，Widget 恢复为 Continuum · P03。
5. /quit 退出。
TXT
(cd "$SOURCE" && CONTINUUM_CLI_ENTRY="$ROOT/dist/cli/index.js" CONTINUUM_OMP_TRACE_FILE="$UI_TRACE" omp)

if ! node - "$SOURCE/.continuum-local/runtime.db" "$DESIGN_REV" <<'NODE'
const DB=require('better-sqlite3'); const db=new DB(process.argv[2]); const expected=process.argv[3];
const block=db.prepare("SELECT status FROM pending_interactions WHERE interaction_id='int_p08_block'").get();
const decisions=db.prepare("SELECT status,payload_json FROM pending_interactions WHERE type='DECISION'").all();
const binding=db.prepare('SELECT target_artifact_id,work_start_revision FROM worktree_bindings LIMIT 1').get(); db.close();
if(!block||block.status!=='resolved') throw new Error(`design conflict was not resolved by explicit restart confirmation: ${JSON.stringify(block)}`);
const restart=decisions.map(r=>({status:r.status,payload:JSON.parse(r.payload_json)})).find(x=>x.payload.context?.kind==='restart-blocked-work');
if(!restart||restart.status!=='resolved') throw new Error(`restart decision was not resolved: ${JSON.stringify(restart)}`);
if(!binding||binding.target_artifact_id!=='P03') throw new Error(`P03 was not rebound: ${JSON.stringify(binding)}`);
if(binding.work_start_revision!==expected) throw new Error(`new Work Baseline must equal committed design revision: ${JSON.stringify(binding)}`);
NODE
then
  echo "--- OMP UI lifecycle/action trace ---" >&2
  cat "$UI_TRACE" >&2 || true
  exit 4
fi

read -r -p "上面五组 UI 是否都符合预期？输入 yes 确认： " ANSWER
if [ "$ANSWER" != "yes" ]; then
  echo "FAIL: interactive OMP UI was not accepted." >&2
  exit 3
fi

echo "PASS: real OMP TUI interaction and design-restart flow accepted."
printf 'PASS\n' > "$EVIDENCE/omp-ui-result.txt"
echo "P08_EVIDENCE=$EVIDENCE"
