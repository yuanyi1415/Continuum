# ADR-007｜Host-native Interaction

**状态**：Proposed

## Context

Codex 是 GUI，OMP 是 TUI；强求同一视觉形态会导致体验割裂。

## Decision

Core 统一交互语义：

```text
STATUS
NOTICE
DECISION
BLOCK
```

Renderer 按 Host 原生能力实现。

### Codex

- default silent；
- DECISION：MCP Elicitation first；
- fallback：Hook Gate；
- BLOCK：Hook Block。

### OMP

- ad-hoc silent；
- managed：single ambient widget；
- simple decision：select；
- heavy decision：overlay；
- block：blocking overlay。

## Consequences

- 行为统一，视觉不强行统一；
- Adapter 需要 capability detection；
- Headless 需要独立 fallback。
