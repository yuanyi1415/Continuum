# 09｜CLI 与 MCP 接口

## 1. CLI 设计原则

Human / Agent 共用一个底层 CLI。

默认 Surface 小，不直接暴露内部所有 CRUD。

---

## 2. Primary Commands

```bash
continuum init
continuum status
continuum context [work]
continuum reconcile
continuum archive
```

---

## 3. Project / Change Commands

```bash
continuum change open "<title>"
continuum change close <id>
continuum change supersede <id> --by <new-id>
```

`close` 内部必须执行 Change Reconcile，不允许只改状态字符串。

---

## 4. Work Fallback Commands

主要用于：

- Generic Agent；
- Debug；
- Host Adapter 不可用。

```bash
continuum work bind <ticket>
continuum work current
continuum work suppress-session
```

日常 Codex / OMP 不要求用户手工 bind。

---

## 5. Maintenance

```bash
continuum doctor
continuum doctor --recover
continuum migrate
continuum host install codex
continuum host install omp
continuum host doctor
```

---

## 6. Output Contract

所有关键命令支持：

```bash
--json
```

机器输出：

```json
{
  "ok": true,
  "data": {},
  "warnings": [],
  "interaction": null
}
```

错误：

```json
{
  "ok": false,
  "error": {
    "code": "...",
    "message": "...",
    "recoverable": true
  }
}
```

---

## 7. MCP Surface

MVP 不把整个 Domain CRUD 暴露成几十个 MCP Tool。

建议最多：

```text
project_status
project_context
project_reconcile
project_interact
```

### project_status

返回最小 Project / Work 状态。

### project_context

返回 Context Manifest。

### project_reconcile

显式请求生命周期收敛。

### project_interact

仅为支持 Host structured interaction。

---

## 8. MCP 不是 Authority

任何 MCP Tool 最终都必须调用同一 Application Use Case。

禁止：

```text
MCP 自己维护一套状态。
```


## 9. P09 Maintenance Command Contract（v1.0.5）

```bash
continuum doctor
continuum doctor --recover
continuum migrate
continuum host doctor
```

- `doctor`：只诊断；
- `doctor --recover`：仅修复可确定推导的 Runtime / Adapter 问题；
- `migrate`：显式 Durable migration，同时推进 Runtime migration；
- `host doctor`：诊断 Codex / OMP executable、capability 与 repo-local adapter drift。

所有命令继续支持 `--json`。


## 10. P10 Archive Command Contract（v1.0.6）

```bash
continuum archive
continuum archive --allow-incomplete
continuum archive --with-history
continuum archive verify <archive-path>
```

- 默认 Archive 必须 complete；
- `--allow-incomplete` 仅允许用户显式接受 Required Artifact 缺失/外部化；
- `--with-history` 增加 `source/history.bundle`；
- `archive verify` 不依赖原 Repo，可对 standalone Archive 执行；
- 所有命令支持 `--json`。

## 11. P11 Global Setup Contract（v1.1.0）

机器级：

```bash
continuum setup [--skip-codex] [--skip-omp]
continuum doctor --global
continuum host doctor
```

- `setup` 不要求当前目录是 Git Repository；
- 默认检测并安装可用 Codex / OMP Global Bridge；
- Host 不存在时跳过并给 warning；
- `host doctor` 可从任意目录诊断 user-level bridge；
- 所有关键命令支持 `--json`。

repo-local Adapter 安装降为兼容模式：

```bash
continuum host install codex --project
continuum host install omp --project
```

### Agent Tool Surface

Global Codex MCP / OMP Extension 增加：

```text
continuum_init
continuum_status
continuum_doctor
```

Tool 仍不是 Authority；最终必须调用同一 Application / CLI 路径。
