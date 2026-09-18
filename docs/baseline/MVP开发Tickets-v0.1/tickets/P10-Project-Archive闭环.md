# P10｜Project Archive 闭环

## 目标

把一个完成的 Live Federated Project 物化成可独立保存、重新理解的 Project Archive。

## 范围

实现：

- `continuum archive`；
- Archive Coordinator；
- final Snapshot；
- Project / Change metadata；
- ADR / CONTEXT / Spec / Ticket materialization；
- important evidence；
- source final snapshot；
- manifest + SHA256；
- missing/external/unsupported 状态；
- `--allow-incomplete`；
- `--with-history` → Git bundle。

## 默认源码策略

必须默认包含：

```text
Final Source Snapshot
```

完整 History 可选。

## 验收

1. 完成一个 fixture Project；
2. archive；
3. 临时移走原 Repo / 模拟远程 Tracker 不可用；
4. Archive 内仍可读取：
   - final project state；
   - Change history；
   - ADR / CONTEXT；
   - Specs / Tickets；
   - final source；
5. manifest hash 校验通过；
6. `--with-history` bundle 可恢复 Git Repository。

## 依赖

P06 + P09。
