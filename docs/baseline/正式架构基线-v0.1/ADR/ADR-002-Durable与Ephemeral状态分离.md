# ADR-002｜Durable Project State 与 Ephemeral Runtime State 分离

**状态**：Proposed

## Context

项目知识需要跟 Repo 走，而 Session / Hook / Pending Candidate 属于高频运行态。

## Decision

候选：

```text
.continuum/
→ Durable / Git tracked

.continuum-local/
→ Ephemeral / gitignored
```

Durable 内容必须可 clone / review / migrate。

Ephemeral 内容必须允许丢失并可恢复。

## Consequences

- 项目知识可移植；
- Runtime 高频写不污染 Git；
- 需要明确恢复算法；
- 需要 Storage Port 分离。
