# 04｜Agent 接入与宿主交互

## 1. Agent 接入原则

Continuum 不要求所有 Coding Agent 拥有相同 Plugin API。

采用 Graceful Degradation：

```text
Level 1
Native Hook / Extension
→ 最佳体验

Level 2
MCP + Skill / Rules
→ 较自然工具调用

Level 3
CLI + Git Hook + AGENTS.md
→ Correctness 下限
```

> **Native Integration 决定体验上限；Git + CLI 决定兼容下限。**

---

## 2. Lifecycle 触发模型

### 高频事件只作为 Signal

例如：

```text
file edit
tool call
test
command
```

不得直接推进 Project State。

### Stable Boundary

例如：

```text
agent settled
session stop
session end
post commit
```

触发 Lifecycle Check。

### 关键原则

```text
Event
→ wake Continuum
→ Continuum rereads Authority
→ derive state
→ reconcile if needed
```

而不是：

```text
Event
→ event itself becomes truth
```

---

## 3. Codex Adapter 基线

已在 Codex CLI 0.154.0 真实 E2E 验证。

### Lifecycle

使用：

```text
SessionStart
UserPromptSubmit
Stop
SessionEnd
```

职责：

- SessionStart：检测项目 / resume Work；
- UserPromptSubmit：识别明确 Work Intent；
- Stop / SessionEnd：Stable Boundary。

### UX

Codex GUI 最终策略：

> **Default Silent。**

普通进入项目、正常开发、普通成功：

- 不做常驻状态显示；
- 不反复提示 Continuum 存在。

#### DECISION

Primary：

```text
MCP Elicitation
```

Fallback：

```text
Hook Gate
```

实际 Host UX Spike 中，MCP Elicitation 明显优于 Hook Gate。

#### BLOCK

使用确定性 Hook Block + structured reason。

---

## 4. Oh My Pi Adapter 基线

已在 OMP 18.2.1 真实 E2E 验证。

### Lifecycle

稳定基线：

```text
session_start
before_agent_start
session_stop
session_shutdown
```

`input` 可作为增强，但不能成为 correctness 必需事件。

### UX

OMP 是 TUI，可提供 Ambient Presence，但必须克制。

#### 非 Continuum / Ad-hoc

完全静默。

#### Managed Work

只保留一个 Ambient Widget：

```text
Continuum · 用户 Memory / P03
```

不同时叠加：

- Status line；
- Action line；
- 多个常驻 Widget。

#### 简单 DECISION

```text
ui.select()
```

#### 重 DECISION / N3

```text
custom overlay
```

#### BLOCK / N4

blocking overlay。

#### NOTICE

短暂 notify，不常驻。

---

## 5. Host Interaction Model

Core 只产生统一语义：

```text
STATUS
NOTICE
DECISION
BLOCK
```

### STATUS

不要求输入。

### NOTICE

值得知道，但不阻塞。

### DECISION

需要用户明确选择。

### BLOCK

继续工作会破坏一致性，必须停止。

---

## 6. Renderer Contract

| Interaction | Codex GUI | OMP TUI |
|---|---|---|
| STATUS | 默认静默 | managed 时单一 Widget |
| NOTICE | 必要时 inline message | `notify()` |
| 简单 DECISION | MCP Elicitation | `select()` |
| 重 DECISION | MCP Elicitation / Hook fallback | Overlay |
| BLOCK | Hook Block | Blocking Overlay |

---

## 7. 什么时候可以打断用户

### 不打断

- 普通进入项目；
- 普通 Resume；
- N0 Ticket 完成；
- N1 机械状态变化；
- 成功 Reconcile；
- Context 自动路由。

### 可以打断

仅：

- 归属歧义无法安全自动判断；
- N3 Architecture Decision；
- N4 Design / Scope Gap；
- Authority conflict；
- 继续执行将产生不可逆错误。

原则：

> **Silent by default, interrupt on significance.**

---

## 8. Existing-intent Activation

Continuum 不要求额外仪式。

例如：

```text
/implement P03
```

已经足够表达：

> “正式进入 P03。”

因此：

```text
自动 Work Binding
```

而不是再问：

```text
是否 manage P03？
```

同样：

```text
/to-spec 用户 Memory
```

若归属唯一，可自动 Open / Bind Change。

只有存在多个可能 Change 时才请求 DECISION。

---

## 9. Escape Hatch

用户必须能一句话退出当前管理：

> “这次别管 Continuum。”

效果：

```text
Session Suppression = on
Worktree Binding = unchanged
```

下一个新 Agent Session 仍可恢复原 Work。

---

## 10. Headless

Interactive UI 不可用时：

- 不猜；
- 不默认选择；
- 输出 machine-readable pending decision；
- 在安全边界停止。

例如：

```json
{
  "status": "blocked",
  "reason": "continuum_decision_required",
  "decision_id": "D-021"
}
```
