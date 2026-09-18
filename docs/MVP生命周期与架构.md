# Continuum MVP 生命周期与架构

## 定位

Continuum 是 Coding Agent 之上的项目生命周期控制面。

```text
User
  ↓
Codex / OMP / Coding Agent
  ↓ lifecycle signal
Host Adapter
  ↓
Continuum Application / Domain
  ↓
Git + Durable YAML + Runtime SQLite
```

## 三类事实

### Git

拥有源码与 revision 事实。

### `.continuum/`

拥有可随项目迁移的 Durable Project State：

- Project
- Current
- Snapshot
- Change
- ArtifactRef
- Relation
- Change Reconcile

### `.continuum-local/`

拥有可重建的本机 Runtime State：

- Worktree Binding
- Session Binding
- Pending Work Reconcile
- Interaction
- Session Suppression

## 主生命周期

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

## 设计冲突恢复

```text
Managed Work
→ 发现设计冲突
→ Return To Design
→ Work Binding 释放
→ Change 保持 active
→ 修改相关 Spec / ADR
→ 再次 implement
→ Authority Version 发生变化
→ 用户确认 Restart
→ 新 Work Baseline
```

内部存在 BLOCK phase，但普通用户不需要直接操作内部状态。

## Host 边界

Host Adapter 只负责：

```text
Host Lifecycle Event
→ Normalized Lifecycle Signal
→ Continuum Core
→ Host-native Renderer
```

关键正确性不能依赖 LLM 主动调用 Continuum。

## Doctor / Recovery

Recovery 原则：

```text
Runtime 可推导
→ 可以恢复

Durable Authority 不明确
→ 只诊断，不猜
```

## Archive

```text
Live Federated Authority
→ Final Snapshot
→ Final Source + Durable State + Materialized Authority
→ checksums
→ Self-contained Archive
```

Archive 默认不包含完整 Git history；`--with-history` 才增加 bundle。
