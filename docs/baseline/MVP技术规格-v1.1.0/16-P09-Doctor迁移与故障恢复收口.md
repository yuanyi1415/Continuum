# 16｜P09 Doctor、迁移与故障恢复收口

P09 不引入新的 Project / Change / Work / Snapshot 长期语义。

冻结维护原则：

```text
Doctor = Diagnose first
Recover = only derivable runtime repair
Migrate = explicit durable forward migration
Authority ambiguity = fail closed
```

## 关键行为

- `runtime.db` 删除：可重建 Runtime，但不猜 Work owner；
- `runtime.db` 损坏：先 quarantine，再重建；
- Hook 丢失且 Work Binding 仍在：从 Git state 补建 pending Work Reconcile；
- Current pointer 指向不存在 Snapshot：明确失败，不选择其它 Snapshot；
- ArtifactRef 指向不存在 authority source：`CONTINUUM_AUTHORITY_UNAVAILABLE`；
- Host Adapter missing / drift：WARN，不修改 Durable Project State。
