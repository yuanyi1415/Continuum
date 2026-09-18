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
