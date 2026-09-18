# ADR-006｜Ticket 临时 Reconcile 与 Change 持久 Reconcile

**状态**：Proposed

## Context

每 Ticket 都写 Git Artifact 会产生噪音与并发冲突。

## Decision

```text
Ticket / Work Reconcile
→ ephemeral pending candidate

Change Reconcile
→ durable project convergence
→ may advance Snapshot
```

## Consequences

- 普通 Ticket 零长期文档；
- Git 更干净；
- Change close 时必须重新验证完整事实。
