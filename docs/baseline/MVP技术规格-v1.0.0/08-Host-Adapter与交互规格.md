# 08｜Host Adapter 与交互规格

## 1. Host Adapter 两部分

```text
Lifecycle Adapter
Interaction Renderer
```

---

## 2. Codex Adapter

已验证宿主版本：

```text
Codex CLI 0.154.0
```

### 生命周期事件

MVP 使用：

```text
SessionStart
UserPromptSubmit
Stop
SessionEnd
```

### UX

默认：

```text
silent
```

不做常驻 STATUS。

### DECISION

优先：

```text
Structured MCP Elicitation
```

但正确性要求：

> MCP Elicitation 只是最佳 Renderer；若宿主无法确定性拉起，则必须退化到 Hook Gate，不允许因为 UI 更漂亮而绕过 Blocking Decision。

### BLOCK

```text
Hook deterministic block
+
structured reason
+
next action
```

### Project Scope

Repo-local Hook。

若 MCP 注册只能 user-level：

- Adapter 必须检测 `.continuum/`；
- 非 Continuum 项目 NOOP；
- 不向其它 Repo 注入状态。

---

## 3. OMP Adapter

已验证宿主版本：

```text
OMP 18.2.1
```

### 生命周期事件

MVP：

```text
session_start
before_agent_start
session_stop
session_shutdown
```

`input` 只能作为 UX 增强。

### Ambient UI

只有 Managed Work 显示：

```text
Continuum · <Change> / <Work>
```

单一 Widget。

禁止默认叠加：

- Continuum status line；
- action line；
- second widget。

### Simple DECISION

```text
ui.select()
```

### Heavy DECISION

```text
custom overlay
```

### BLOCK

```text
blocking overlay
```

### NOTICE

```text
notify()
```

短暂显示。

---

## 4. Generic Adapter

最低要求：

- shell；
- Git；
- CLI。

能力：

```text
project detect
status
manual bind fallback
post-commit checkpoint
explicit reconcile
```

没有原生 UI 时：

```text
DECISION_REQUIRED
```

以 CLI exit code + JSON 输出停止。

---

## 5. Host Capability

Adapter 启动时可报告：

```yaml
capabilities:
  ambient_status:
  structured_decision:
  blocking_ui:
  lifecycle_hooks:
  session_id:
  headless:
```

Interaction Router 根据 capability 选择 Renderer。

---

## 6. Headless Contract

如果：

```text
DECISION / BLOCK
```

且无 UI：

```json
{
  "status": "blocked",
  "code": "CONTINUUM_DECISION_REQUIRED",
  "interaction_id": "int_xxx"
}
```

不得自动选默认项。

---

## 7. Escape Hatch

自然语言或 Host Command：

```text
这次别管 Continuum
```

→ Session Suppression。

不得清空 Worktree Binding。
