# P08｜Oh My Pi 原生适配闭环

## 目标

让 OMP TUI 获得 Host-native 的项目连续性体验。

## 范围

实现：

- project extension；
- `session_start`；
- `before_agent_start`；
- `session_stop`；
- `session_shutdown`；
- explicit Work Intent；
- Worktree resume；
- single ambient widget；
- simple DECISION `select()`；
- heavy DECISION overlay；
- BLOCK overlay；
- NOTICE notify；
- Session Suppression；
- `continuum host install omp`；
- Host capability detection。

## UX 冻结

```text
aware → silent
managed → one widget
simple decision → select
heavy decision → overlay
block → blocking overlay
```

不得同时默认显示：

```text
widget + status line + action line
```

## 真实 E2E

1. ad-hoc silent；
2. implement P03 bind；
3. fresh session resume；
4. Codex-bound work 可由 OMP resume；
5. suppression 只影响当前 Session；
6. pending decision UI；
7. reconcile success 不刷屏。

## 依赖

P05 + P06。

可与 P07 并行。
