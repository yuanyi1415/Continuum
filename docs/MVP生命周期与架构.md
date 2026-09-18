# Continuum v1.1 生命周期与架构

## 1. 定位

Continuum 是 Coding Agent 背后的项目生命周期控制面。

v1.1 的默认接入关系：

```text
User
  ↓
Codex / OMP
  ↓
Global Host Bridge              ← User / Machine Scope
  ↓
Continuum Application / Domain
  ↓
Git + Durable YAML + Runtime SQLite
                                ← Project Scope
```

人的主要工作入口仍是 Codex / OMP，而不是 Continuum CLI。

## 2. 两个 Scope

### User / Machine Scope

```text
Continuum CLI
Codex Global Hook + MCP
OMP Global Extension
```

通过：

```bash
continuum setup
```

安装一次。

### Project Scope

```text
.continuum/
.continuum-local/
```

项目是否启用只由 `.continuum/project.yaml` 决定。

Global Bridge ≠ 所有项目自动受控。

## 3. Project Auto Detection

Global Bridge 每次收到 Host 生命周期信号：

```text
Host cwd
→ 向上寻找 .continuum/project.yaml
├─ 找到 → normalize event → Continuum Core
└─ 未找到 → silent NOOP
```

这保持了：

```text
Project-scoped
Opt-in
Default silent
```

## 4. 三类项目事实

### Git

拥有源码与 revision 事实。

### `.continuum/`

拥有 Durable Project State：

- Project
- Current
- Snapshot
- Change
- ArtifactRef
- Relation
- Change Reconcile

### `.continuum-local/`

拥有可重建 Runtime State：

- Worktree Binding
- Session Binding
- Pending Work Reconcile
- Interaction
- Session Suppression

## 5. 主生命周期

```text
Project Snapshot
→ Change
→ Ticket / Spec / ADR / CONTEXT
→ Work Binding
→ Work Baseline
→ Agent Implementation
→ Work Reconcile
→ Change Reconcile
→ New Snapshot
→ Change Closed
```

P11 不改变这条主链。

## 6. Agent-driven UX

Global Host Integration 允许 Coding Agent 调用最小 Project Tools：

```text
continuum_init
continuum_status
continuum_doctor
```

因此用户可以自然语言操作：

```text
给这个项目启用 Continuum
当前项目是什么状态
检查一下 Continuum 有没有问题
```

但 Tool 只是便利层。

## 7. Mechanism-driven Correctness

关键生命周期继续由 Host Bridge 确定性触发：

```text
User Prompt / Host Event
→ Global Bridge
→ Project Detection
→ Normalized Lifecycle Signal
→ Continuum Core
```

禁止退化成：

```text
LLM 想起来才调用 Continuum
```

## 8. Design Conflict Recovery

```text
Managed Work
→ 发现设计冲突
→ Return To Design
→ Work Binding 释放
→ Change 保持 active
→ 更新 Spec / ADR
→ 再次 implement
→ Authority Version 变化
→ 用户确认 Restart
→ 新 Work Baseline
```

内部 BLOCK phase 不作为普通用户心智模型。

## 9. Legacy Host Compatibility

P07 / P08 老项目可能已有 repo-local Adapter。

Global Bridge 检测到后：

```text
Global Bridge
→ defer
→ legacy project adapter handles event
```

防止双执行。

新项目不再默认创建 `.codex/` / `.omp/`。

## 10. Doctor / Recovery

机器级：

```bash
continuum doctor --global
```

检查 Global Host Bridge。

项目级：

```bash
continuum doctor
continuum doctor --recover
```

恢复原则不变：

```text
Runtime 可确定推导 → 可恢复
Durable Authority 不明确 → 只诊断，不猜
```

## 11. Archive

```text
Live Federated Authority
→ Final Snapshot
→ Final Source + Durable State + Materialized Authority
→ checksums
→ Self-contained Archive
```

默认不含完整 Git History；`--with-history` 增加 bundle。
