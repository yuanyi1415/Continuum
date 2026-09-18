# 11｜Archive 规格

## 1. 目标

Project 完成后：

> 即使外部 Tracker / Agent / 插件未来消失，项目仍能被重新理解。

---

## 2. Archive 输入

```text
Final Snapshot
Changes
Durable Change Reconciles
CONTEXT
ADR
Spec
Ticket
Important Evidence
Repository Identity
Final Revision
```

---

## 3. Archive 输出

```text
archive-<id>/
├── manifest.yaml
├── continuum/
├── artifacts/
│   ├── context/
│   ├── adr/
│   ├── spec/
│   ├── tickets/
│   └── evidence/
└── source/
    └── [optional git bundle / source metadata]
```

---

## 4. manifest.yaml

至少：

```yaml
archive_id:
project_id:
created_at:
final_snapshot:
repository:
  identity:
  revision:
artifacts:
  - original_ref:
    materialized_path:
    sha256:
    status:
missing_or_external: []
```

---

## 5. Materialization 状态

```text
materialized
external
missing
unsupported
```

默认 Archive 如果存在 `missing`：

```text
archive status = incomplete
```

用户可显式：

```text
--allow-incomplete
```

---

## 6. Source Code

v1.0.0 冻结：

### 默认

Archive 必须包含 Final Source Snapshot。

实现建议：

```text
git archive <final-revision>
```

这样 Archive 至少包含最终版本源码，而不是只保存 Repository Identity + Revision。

### 可选完整历史

```bash
continuum archive --with-history
```

生成：

```text
git bundle
```

用于离线保存完整 Git History。

原则：

> Final Source Snapshot 默认包含；完整 Git History 按需包含。

---

## 7. Personal Knowledge

不在 MVP Archive 自动提炼。

后续：

```text
Project Archive
→ Retrospective
→ Knowledge Extraction
```


## 8. P10 实现冻结（v1.0.6）

### Archive Ready Gate

必须同时满足：

- 所有 Change 为 `closed | superseded`；
- Current Final Snapshot `active_changes=[]`；
- Final Snapshot 无 blocker；
- Final Snapshot 存在与 Project Repository Identity 匹配的 baseline；
- Final revision 在当前 Repository 中可达。

否则：

```text
CONTINUUM_ARCHIVE_NOT_READY
```

### Final Revision Authority

Archive 不使用当前 HEAD 代替最终版本。

```text
Current Snapshot
→ matching repository baseline
→ final revision
→ source + artifact materialization
```

即使 Archive 时 HEAD 已有后续非项目提交，也必须归档 Final Snapshot revision。

### Durable State

Archive 中 `continuum/` 保存 Project 完成时的 Durable state：Project / Current / Snapshots / Changes / ArtifactRefs / Relations / Durable Change Reconciles。`archives/` 不递归复制。

### Artifact Materialization

MVP 必须物化：

```text
context
adr
spec
ticket
review / evidence
```

均从 Final revision 的 Git blob 读取，而不是当前 working tree。

`document / other` 记录为 `unsupported`，不作为 MVP completeness gate。

Required 类型的 `missing / external` 会令 Archive incomplete；默认拒绝创建，只有 `--allow-incomplete` 可显式放行。

### Integrity

Archive 根目录包含：

```text
manifest.yaml
checksums.sha256
```

checksum 覆盖 manifest、Continuum Durable copy、materialized artifacts、source snapshot 与可选 history bundle。Archive 创建完成前必须先自校验。
