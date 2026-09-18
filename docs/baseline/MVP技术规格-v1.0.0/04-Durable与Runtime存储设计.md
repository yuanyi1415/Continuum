# 04｜Durable 与 Runtime 存储设计

## 1. Durable Root

```text
.continuum/
├── project.yaml
├── current.yaml
├── snapshots/
│   └── snap_<id>.yaml
├── changes/
│   └── change_<id>.yaml
├── artifacts/
│   └── artifact_<id>.yaml
├── relations/
│   └── rel_<id>.yaml
├── reconciles/
│   └── change_<id>_<reconcile-id>.yaml
└── archives/
    └── <archive-id>/
```

---

## 2. 文件设计原则

### Immutable

默认 immutable：

- Snapshot；
- Durable Change Reconcile；
- Archive Manifest。

### Mutable

允许有限更新：

- `project.yaml`：极低频 metadata；
- `current.yaml`：只更新 pointer；
- active Change；
- ArtifactRef version / metadata；
- Relation lifecycle metadata。

---

## 3. YAML 规范

- UTF-8；
- LF；
- 2 spaces；
- 无 anchor / alias；
- UTC ISO-8601；
- canonical key order；
- 每个文件含 `schema_version`；
- 写入前 validation；
- 写入采用 temp → fsync → atomic rename。

---

## 4. current.yaml

```yaml
schema_version: 1
project_id: prj_xxx
snapshot_id: snap_xxx
updated_at:
```

推进使用 optimistic concurrency：

```text
advanceCurrent(expected_snapshot_id, new_snapshot_id)
```

若 current 已变化：

```text
ERR_SNAPSHOT_CONFLICT
```

不得覆盖。

---

## 5. Runtime SQLite

文件：

```text
.continuum-local/runtime.db
```

配置：

```text
journal_mode = WAL
foreign_keys = ON
busy_timeout = 5000
```

核心表见：

`sql/runtime.sql`

---

## 6. Runtime 数据

至少包含：

- worktree binding；
- session binding；
- session suppression；
- pending reconcile；
- event cursor / idempotency；
- pending interaction；
- diagnostics；
- schema migrations。

---

## 7. Runtime 丢失恢复

若 `runtime.db` 被删除：

```text
continuum doctor --recover
```

必须能够根据：

```text
Current Snapshot
Git HEAD
Change/Ticket refs
Host current worktree
```

恢复：

- project awareness；
- unreconciled revision difference；

但无法可靠恢复的 Session-only suppression 可直接丢失。

---

## 8. Schema Migration

### Durable

```text
schema_version
```

CLI 检测：

- older supported → explicit migrate；
- newer than CLI → fail closed。

### Runtime

SQLite 使用：

```text
schema_migrations
```

启动时自动向前迁移允许，但必须：

- transactional；
- 可重跑；
- 失败不破坏原 DB。

---

## 9. Git Ignore

`continuum init` 必须确保：

```text
.continuum-local/
```

进入 `.gitignore`。

不得自动 ignore `.continuum/`。
