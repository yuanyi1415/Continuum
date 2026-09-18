# ADR-003｜State-derived Lifecycle

**状态**：Proposed

## Context

不同 Agent 的 Hook 能力不一致；事件可能丢失、重复或版本变化。

## Decision

> Lifecycle correctness 由 Authority State 推导；Host Event 只作为 wake-up signal。

## Consequences

- Hook 丢失可恢复；
- 重复事件可幂等；
- Adapter 更轻；
- 每次 Checkpoint 需要重新读取必要 Authority。
