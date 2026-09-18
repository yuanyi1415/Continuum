# P06｜Change Reconcile 与 Snapshot 推进

## 目标

完成 Continuum 真正的长期收敛：

```text
Work Reconcile[]
→ Change Reconcile
→ durable result
→ new Snapshot
→ Current advances
→ Change closed
```

## 范围

实现：

- ReconcileChange Use Case；
- 读取 Spec / Ticket / relevant Context / ADR；
- 汇总 pending Work Reconcile；
- Knowledge Change proposals；
- InteractionRequest `STATUS/NOTICE/DECISION/BLOCK`；
- durable Change Reconcile；
- immutable Snapshot；
- current CAS；
- `continuum reconcile`；
- `continuum change close`；
- Generic headless DECISION/BLOCK JSON contract。

## 验收

### Success

- 所有 required Work 完成；
- Evidence 满足；
- 无 BLOCK；
- 生成 durable reconcile；
- 生成 Snapshot N+1；
- Current 从 N → N+1；
- Change 变 closed。

### Conflict

Current 在 reconcile 中被另一个进程推进：

```text
ERR_SNAPSHOT_CONFLICT
```

不得覆盖。

### N3 / N4

- N3 产生 DECISION；
- N4 阻止 close；
- 无 UI 时机器返回 `CONTINUUM_DECISION_REQUIRED` / `CONTINUUM_BLOCKED`。

## 依赖

P04 + P05。
