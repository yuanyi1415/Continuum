# ADR-004｜Worktree 连续性与 Session 抑制

**状态**：Proposed

## Context

真实 E2E 已验证 Codex → OMP → Codex 的跨 Agent 接续需求。

## Decision

- Worktree Binding = 当前工作连续性 Authority；
- Session Binding = 当前宿主会话映射；
- Session Suppression = 当前会话临时退出；
- suppress session 不删除 Worktree Binding。

## Consequences

- Agent 可无缝切换；
- “这次别管”不会破坏项目当前工作；
- Worktree identity 必须稳定定义。
