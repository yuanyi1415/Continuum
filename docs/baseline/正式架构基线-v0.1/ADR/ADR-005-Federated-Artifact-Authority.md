# ADR-005｜Federated Artifact Authority

**状态**：Proposed

## Context

Spec、Ticket、ADR、CONTEXT、Git 各自已有事实权威。

## Decision

Continuum 不复制其正文作为默认 Authority。

只保存：

```text
ArtifactRef
+
Typed Relation
+
Version / Locator
```

## Consequences

- 避免双重事实源；
- Live Project 更轻；
- Archive 阶段需要 Materialization。
