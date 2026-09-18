# ADR-010｜Global Host Integration

**状态**：Accepted  
**版本**：v1.1.0  
**背景 Ticket**：P11｜Global Host Integration & Zero-Ceremony Onboarding

## 1. Context

P01～P10 已证明 Continuum 的项目生命周期机制可以成立，但真实安装与启用过程暴露了一个产品级 Architecture Gap：

```text
每个项目
→ continuum init
→ continuum host install codex
→ continuum host install omp
```

这把两个不同 Scope 混在了一起：

- Continuum Project 是否启用，属于 Project Scope；
- Codex / OMP 是否具备 Continuum 接入能力，属于 User / Machine Scope。

结果是用户每进入一个项目都要重复安装 Host Adapter，且产品心智变成“先操作 Continuum，再使用 Agent”，与 Continuum 作为后台控制面的定位冲突。

## 2. Decision

从 v1.1 起，默认接入架构冻结为：

```text
User / Machine Scope
├─ Continuum CLI
├─ Codex Global Bridge
└─ OMP Global Bridge
        │
        ↓
Project Scope
├─ .continuum/
└─ .continuum-local/
```

### 2.1 Global Bridge 安装一次

机器初始化：

```bash
continuum setup
```

默认行为：

- 检测 Codex；
- 安装用户级 Codex Hook；
- 注册用户级 Continuum MCP；
- 检测 OMP；
- 安装用户级 OMP Extension；
- 不要求当前目录是 Git Repository。

### 2.2 Project 仍然 Opt-in

Global Bridge 每次收到 Host 生命周期事件时：

```text
cwd
→ 向上查找 .continuum/project.yaml
├─ 找到 → 交给 Continuum Core
└─ 未找到 → silent NOOP
```

因此：

```text
Global Integration ≠ Global Project Management
```

Continuum 仍然只管理显式启用的项目。

### 2.3 Agent-driven UX

Codex / OMP 全局接入后，可以向 Agent 暴露最小项目操作：

```text
continuum_init
continuum_status
continuum_doctor
```

用户可以自然语言要求：

> 给这个项目启用 Continuum。

Agent Tool 属于便利层，不成为生命周期正确性的唯一触发来源。

### 2.4 Mechanism-driven Correctness

继续冻结：

```text
Agent-driven UX
+
Global Bridge deterministic lifecycle interception
```

例如 `implement P03` 的 Work Binding / Gate 不得只依赖模型主动调用 Tool；Global Hook / Extension 仍负责生命周期机制兜底。

### 2.5 Legacy Project Adapter

P07 / P08 已产生的 repo-local Adapter 不立即破坏：

```text
.codex/...
.omp/extensions/continuum.ts
```

Global Bridge 检测到旧项目 Adapter 时必须 defer，防止同一事件被双重处理。

新项目默认禁止再生成 repo-local Host Adapter；仅通过显式兼容命令：

```bash
continuum host install codex --project
continuum host install omp --project
```

## 3. Scope Boundary

P11 不改变：

- Project / Change / Work / Snapshot Authority；
- Durable / Runtime 存储边界；
- Work Reconcile / Change Reconcile；
- BLOCK / Design Conflict 语义；
- Archive 语义。

P11 只修正 Host Integration Scope 与 Onboarding UX。

## 4. Consequences

用户正常心智变为：

```text
第一次装机器
→ npm install -g Continuum
→ continuum setup

以后
→ cd project
→ codex / omp
```

未启用项目静默；需要启用时由 Agent 或 CLI 执行 `continuum init`。

这使 Continuum 回到正确定位：

> 用户主要使用 Codex / OMP 工作，Continuum 在背后维护项目生命周期事实。
