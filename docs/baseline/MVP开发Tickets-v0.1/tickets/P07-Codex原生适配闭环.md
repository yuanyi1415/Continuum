# P07｜Codex 原生适配闭环

## 目标

让用户在 Codex GUI 中基本感觉不到 Continuum，但生命周期可靠工作。

## 范围

实现：

- repo-local Codex Adapter；
- `SessionStart`；
- `UserPromptSubmit`；
- `Stop`；
- `SessionEnd`；
- explicit `/implement P03` intent normalization；
- automatic Work Binding；
- Worktree resume；
- MCP structured DECISION Renderer；
- Hook Gate fallback；
- deterministic BLOCK；
- `continuum host install codex`；
- Host capability detection。

## UX 冻结

```text
normal → silent
resume → default silent
decision → MCP first
decision fallback → Hook Gate
block → Hook Block
```

## 真实 E2E

必须在真实 Codex 上验证：

1. ad-hoc 不绑定；
2. implement P03 自动绑定；
3. freeze baseline；
4. restart session 自动 resume；
5. Work Reconcile 正确；
6. MCP decision 可交互；
7. MCP unavailable 时 fallback 正确；
8. Hook 丢失不破坏 correctness。

## 依赖

P05 + P06。
