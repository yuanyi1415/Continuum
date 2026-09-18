# 04｜Port 与 Adapter 契约

## 1. 设计目标

Continuum 必须做到：

> 新增一个 Coding Agent 时，只新增 Adapter，不修改 Core 语义。

---

## 2. Host Lifecycle Adapter

建议最小接口：

```text
detect_project()
session_started()
observe_user_intent()
stable_checkpoint()
session_stopped()
```

Adapter 输出统一：

```yaml
LifecycleSignal:
  host:
  session_id:
  worktree:
  event_type:
  payload:
  observed_at:
```

Core 不依赖原始 Codex / OMP event schema。

---

## 3. Interaction Renderer

建议接口：

```text
render_status(request)
render_notice(request)
request_decision(request) -> InteractionResult
render_block(request)
```

Core 输入：

```yaml
InteractionRequest:
  id:
  type:
  title:
  message:
  context:
  options:
  blocking:
  reason:
```

Renderer 返回：

```yaml
InteractionResult:
  request_id:
  action:
  selected_option:
  host:
  resolved_at:
```

---

## 4. Git Port

最小能力：

```text
repository_identity()
current_revision()
diff(from, to)
changed_files(from, to)
worktree_identity()
is_dirty()
```

Core 不直接 shell `git`.

---

## 5. Artifact Authority Port

统一读取外部 Authority：

```text
resolve_artifact(ref)
artifact_version(ref)
artifact_exists(ref)
```

不同 Adapter 可连接：

- local file；
- GitHub Issue；
- Spec；
- ADR；
- CONTEXT。

MVP 优先 local / Git-backed artifact。

---

## 6. Test / Evidence Port

最小能力：

```text
collect_test_evidence(work)
collect_review_evidence(work)
verify_completion(work)
```

不能让 LLM 自己声称：

> “测试应该通过了。”

Evidence 必须来自可验证来源。

---

## 7. Project Store Port

负责 Durable Project State：

```text
load_project()
load_current_snapshot()
save_snapshot()
advance_current()
load_change()
save_change()
save_relation()
save_change_reconcile()
```

---

## 8. Runtime Store Port

负责 Local Runtime：

```text
get_worktree_binding()
bind_work()
suppress_session()
is_session_suppressed()
save_pending_reconcile()
load_pending_reconcile()
record_signal_cursor()
```

---

## 9. Matt Adapter

Matt 不作为 Runtime Dependency。

Adapter 只负责识别：

```text
Spec
Ticket
/implement intent
/to-spec intent
/to-tickets outputs
review outputs
```

以及建立 ArtifactRef / Relation。

原则：

> **Observe and integrate; do not fork or rewrite Matt.**
