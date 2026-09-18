# 08｜Host Adapter 与交互规格

## 1. Host Integration 两层

v1.1 冻结：

```text
User / Machine Scope
→ Global Host Bridge

Project Scope
→ .continuum/project.yaml
```

Global Bridge 负责 Host 生命周期接入；项目是否启用仍然 Project-scoped / Opt-in。

## 2. Project Detection Contract

所有 Global Bridge 在处理 lifecycle event 前必须：

```text
Host cwd
→ realpath / normalize
→ upward search .continuum/project.yaml
├─ found → project root
└─ absent → silent NOOP
```

不得因为 Continuum 全局安装而自动创建 Project State。

## 3. Codex Global Bridge

已验证宿主版本基线：

```text
Codex CLI 0.154.0
```

### User-level 安装

默认目录：

```text
$CODEX_HOME
```

未设置时：

```text
~/.codex/
```

安装内容：

```text
hooks.json
config.toml hooks=true
Continuum MCP registration
```

生命周期事件：

```text
SessionStart
UserPromptSubmit
Stop
SessionEnd
```

Global Hook 调用：

```text
continuum host codex hook --global
```

### UX

默认 silent；无常驻 STATUS。

DECISION 优先 MCP structured interaction；不可用时退化到 deterministic Hook Gate。Blocking Decision 不得因 Renderer 不可用而自动通过。

BLOCK 继续使用 deterministic gate + structured reason + next action。

## 4. OMP Global Bridge

已验证宿主版本基线：

```text
OMP 18.2.1
```

### User-level 安装

默认：

```text
~/.omp/agent/extensions/continuum.ts
```

若存在：

```text
PI_CODING_AGENT_DIR
```

则安装到该 Agent Directory。

### 生命周期事件

```text
session_start
before_agent_start
session_stop
session_shutdown
```

### UI

Managed Work 仍使用单一 Ambient Widget：

```text
Continuum · <Work>
```

Simple DECISION → `ui.select()`；Heavy DECISION → custom overlay；NOTICE → notify；Design Conflict 使用用户语言，不暴露内部 BLOCK 术语。

OMP lifecycle handler 的人机等待继续采用 25s fail-closed timeout；timeout 只影响 UX，不改变 Project State。

## 5. Agent-driven Project Tools

Global Host Surface 可暴露最小便利工具：

```text
continuum_init
continuum_status
continuum_doctor
```

这些 Tool 必须调用同一 CLI / Application Use Case。

冻结：

```text
Agent Tool = convenience
Global lifecycle bridge = correctness
```

关键 lifecycle transition 不得依赖 LLM 是否主动调用 Tool。

## 6. Legacy repo-local Adapter

P07 / P08 已存在的项目级 Adapter：

```text
.codex/...
.omp/extensions/continuum.ts
```

继续兼容。

Global Bridge 检测到旧项目 Adapter 时必须 defer，防止同一 lifecycle event 被处理两次。

新项目默认不创建 repo-local Host Adapter。仅显式兼容 / 调试：

```bash
continuum host install codex --project
continuum host install omp --project
```

## 7. Generic Adapter

最低要求：shell + Git + CLI。

无原生 UI 时，blocking DECISION / BLOCK 使用 CLI exit code + JSON fail-closed，不自动选默认项。

## 8. Host Capability

Adapter 可报告：

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

## 9. Session Suppression

自然语言 / Host command 的 Session Suppression 只影响当前 Session，不清空 Worktree Binding，也不能绕过 unresolved design conflict。
