# 06｜生命周期与 Reconcile 规格

## 1. Project Detection

算法：

```text
cwd
→ find Git worktree root
→ find .continuum/project.yaml
```

不存在：

```text
NOOP
```

不得在非 Continuum Repo 输出提示噪音。

---

## 2. Intent Detection

Host Adapter 输出 normalized intent：

```yaml
intent:
  type: implement_work
  target: P03
  confidence: explicit
```

MVP 只有 `explicit` 才能自动 Bind。

模糊自然语言：

```text
“我们可能要看看 P03”
```

不得自动 Bind。

---

## 3. Binding 决策

### 目标唯一

```text
auto bind
```

### 目标不存在

```text
NOTICE / validation error
```

### 多个归属

```text
DECISION
```

---

## 4. Checkpoint 算法

```text
receive signal
↓
project exists?
↓
session suppressed?
↓
active work?
↓
read Work Baseline
↓
read Git current revision
↓
same?
  yes → NOOP
  no  → ReconcileWork
```

---

## 5. 幂等键

Work Reconcile 推荐：

```text
worktree_id + work_id + current_revision
```

同一个 revision：

```text
Stop
SessionEnd
post-commit
```

连续触发时只执行一次事实收敛。

---

## 6. Work Reconcile 输入

```text
Work
Work Baseline
Current Revision
Changed Files
Diff
Ticket / Spec refs
Relevant Context
Relevant ADR
Test Evidence
Review Evidence
```

---

## 7. Knowledge Impact

内部分类：

### N0

实现完全落在现有设计范围。

Action：

```text
AUTO / silent
```

### N1

仅机械项目状态变化。

Action：

```text
AUTO
```

### N2

领域事实发生变化。

Action：

```text
PROPOSE CONTEXT update
```

### N3

出现新的长期架构取舍。

Action：

```text
DECISION
→ ADR
```

### N4

当前 Spec / Scope 本身不成立。

Action：

```text
BLOCK
→ return to design
```

---

## 8. LLM 的职责边界

LLM 可以：

- 解释 Diff 的语义；
- 判断可能的 Knowledge Impact；
- 提议 CONTEXT / ADR 更新内容。

LLM 不可以单独决定：

- Git revision；
- Test pass；
- Artifact 是否存在；
- Work 是否已绑定；
- Snapshot 是否推进；
- 是否绕过 BLOCK。

---

## 9. Change Reconcile

前置：

- Change active；
- 所有要求的 Work 已满足 completion；
- 没有 unresolved BLOCK；
- Spec 可解析。

输出：

```yaml
change_reconcile:
  implementation_summary:
  resolved_work:
  unresolved_work:
  knowledge_changes:
  architecture_decisions:
  discovered_work:
  evidence:
  result: pass|blocked
```

若 `pass`：

```text
new Snapshot
→ advance Current
→ Change closed
```

顺序必须事务化 / 可恢复。

---

## 10. Close 顺序

推荐：

```text
1. Write immutable Change Reconcile
2. Write immutable Snapshot
3. CAS advance current.yaml
4. Mark Change closed
```

若第 3 步冲突：

- 不覆盖；
- Change 保持 active；
- 重新读 Current 后再次 Reconcile。

---

## 11. Discovered Work

Reconcile 发现新问题：

- 记录为 proposal；
- 不自动无限派生 Ticket；
- 由 Matt / Tracker 负责正式创建 Work Item。
