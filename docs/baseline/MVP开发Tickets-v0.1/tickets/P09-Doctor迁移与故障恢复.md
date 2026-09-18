# P09｜Doctor、迁移与故障恢复

## 目标

让 Continuum 在“坏掉一点”的情况下仍然可诊断、可恢复，而不是依赖人工删目录重来。

## 范围

实现：

- `continuum doctor`；
- `continuum doctor --recover`；
- durable schema migration command；
- runtime migration；
- runtime corruption quarantine + rebuild；
- orphan ArtifactRef / Relation 检查；
- missing Current Snapshot；
- Host Adapter diagnostics；
- Git availability；
- pending unreconciled work recovery；
- structured error codes。

## 验收场景

- 删除 `.continuum-local/runtime.db` → recover；
- runtime DB corruption → 保留 corrupt file + rebuild；
- Hook event 全丢 → discover pending work；
- Durable schema old → migrate；
- Durable schema newer → fail closed；
- current pointer broken → doctor 明确报告，不静默猜；
- missing Artifact → report authority error。

## 依赖

P01 + P05 + P06。
