# 01｜MVP 范围与技术选型

## 1. MVP 功能范围

### 必须包含

1. Project Init / Detect；
2. Current Snapshot；
3. Change Open / Close / Supersede；
4. ArtifactRef / Relation；
5. Worktree Binding / Session Suppression；
6. Work Baseline；
7. Context Routing；
8. Lifecycle Checkpoint；
9. Work Reconcile；
10. Change Reconcile；
11. Codex Adapter；
12. Oh My Pi Adapter；
13. Generic CLI + Git fallback；
14. Interaction Router；
15. Project Archive；
16. Doctor / Recovery。

### 明确不做

- Web UI；
- Cloud service；
- 用户体系 / RBAC；
- Multi-agent Scheduler；
- 内建 Issue Tracker；
- Vector RAG；
- Knowledge Graph；
- Personal Knowledge Extraction；
- 自动方法论提炼；
- IDE 全生态插件；
- 远程协作 Runtime State 同步。

---

## 2. 推荐实现技术栈

> 本节已在 v1.0.0 定稿。

### Core / CLI

```text
TypeScript
Node.js 24 LTS
ESM
```

理由：

- Codex / OMP / MCP 生态兼容；
- 本地 CLI 分发成熟；
- Host Adapter 可复用 TS 类型；
- 避免 Python + TS 双核心；
- 跨 macOS / Linux 更容易。

### YAML

```text
yaml
```

要求：

- UTF-8；
- 禁止 YAML Anchor；
- Canonical key order；
- 所有 Durable File 必须经过 Runtime Schema Validation。

### Schema Validation

建议：

```text
JSON Schema 2020-12
+
Ajv
```

TypeScript Domain Type 与 JSON Schema 必须保持一致。

### Runtime SQLite

冻结：

```text
better-sqlite3
```

要求：

- WAL；
- busy_timeout；
- migration table；
- RuntimeStore 隔离具体驱动。

### CLI

建议实现：

```text
commander
```

CLI Library 不是架构依赖。

---

## 3. 安装形态

MVP 目标：

```text
一次安装
+
repo 内 continuum init
+
host adapter install
```

不得要求：

- Docker；
- daemon；
- Redis；
- 外部数据库；
- 本地服务长期常驻。

---

## 4. 平台支持

MVP 验收：

- macOS：First-class；
- Linux：First-class；
- Windows：架构兼容，Native UI/Hook 可延后；
- WSL：按 Linux 路径支持。

文件路径与 Process 调用不得写死 Unix-only 逻辑到 Domain Core。
