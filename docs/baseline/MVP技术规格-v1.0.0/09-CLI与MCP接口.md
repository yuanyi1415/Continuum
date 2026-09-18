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
