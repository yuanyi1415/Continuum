# Continuum

> Local-first project control plane for long-running AI coding projects.
>
> 面向 Codex、Oh My Pi（OMP）及其他 Coding Agent 的本地优先项目生命周期控制面。

Continuum 不替代 Coding Agent，也不替代 Git。它负责把长周期 AI Coding 项目的关键状态变成可追踪、可恢复、可迁移、可归档的项目事实：当前 Change、Work Binding、权威资料、Reconcile、Snapshot、设计冲突、Doctor/Recovery 与最终 Archive。

## 为什么需要 Continuum

长时间使用 Coding Agent 时，真正容易丢失的往往不是代码，而是：

- 当前到底在实现哪个正式 Work；
- 这一轮实现从哪个 Git revision 开始；
- 哪些 Spec / ADR / CONTEXT 是当前权威依据；
- 多个 Session / Host 是否仍在做同一件事；
- 实现结束后项目状态是否真的收敛；
- 设计冲突发生后应该回到哪里处理；
- Runtime/Hook 损坏后能否恢复；
- 项目完成后能否形成自包含、可校验的归档。

Continuum 把这些问题从“靠 Agent 自己记住”变成确定性的项目状态。

## 核心原则

```text
Coding Agent 负责工作
Continuum 负责项目生命周期事实
Git 负责代码与版本历史
Matt / Spec / ADR / Ticket 继续拥有各自权威内容
```

- **Local-first**：Node.js + Git + SQLite，不要求 Docker、Daemon 或外部数据库。
- **Project-scoped / opt-in**：只有执行 `continuum init` 的 Git 项目才启用。
- **State-derived correctness**：Hook/Extension 负责唤醒，项目状态不依赖 LLM 自觉。
- **Global Host Bridge**：Codex 使用用户级 Hook + MCP，OMP 使用用户级 Extension；项目无需重复安装 Host Adapter。
- **Fail-closed**：关键 Authority、Snapshot、Schema 不明确时不猜。
- **Live ≠ Archive**：Live Project 使用 Federated Authority；Archive 是自包含物化。

## MVP v1.1 能力

| 能力 | 说明 |
|---|---|
| Project / Snapshot | 项目初始化、Current Snapshot、可移植 Durable State |
| Change / Artifact Graph | Change、ArtifactRef、Typed Relation、Authority |
| Work Binding | worktree 级正式 Work、跨 Session/Host 连续性、Work Baseline |
| Context Routing | Matt Observe/Register、Required/Optional/Historical 最小上下文 |
| Work Reconcile | Git delta、Evidence、幂等候选、Hook 丢失恢复 |
| Change Reconcile | Change 收敛、Snapshot 推进、CAS、设计/架构阻断 |
| Codex Global Bridge | 用户级 Hook + MCP、Agent Tool、确定性 Gate |
| OMP Global Bridge | 用户级 Extension、Agent Tool、Widget、Decision/设计冲突交互 |
| Zero-Ceremony Onboarding | Global Bridge 自动识别 `.continuum/`；未启用项目完全静默 |
| Doctor / Migration / Recovery | Schema 迁移、runtime quarantine/rebuild、Host drift 诊断 |
| Project Archive | Final Snapshot 源码/资料物化、SHA256、自包含校验、可选 Git bundle |

## 环境要求

- **Node.js 24 LTS**
- **Git**
- 可选 Host：
  - Codex CLI
  - Oh My Pi / OMP

Continuum 自身**不要求 Docker**。Docker 只可能作为未来/外部的执行隔离手段，与 Continuum 的本地运行无关。

## 安装

### 1. 全局安装 Continuum

```bash
npm install -g "github:yuanyi1415/Continuum"
```

验证：

```bash
continuum --version
```

### 2. 一次性接入 Codex / OMP

```bash
continuum setup
continuum doctor --global
```

`continuum setup` 会自动检测本机 Host：

```text
Codex → $CODEX_HOME/hooks.json + 全局 MCP
OMP   → ~/.omp/agent/extensions/continuum.ts
```

这一步每台电脑只需要执行一次。以后**不需要在每个项目执行 `continuum host install ...`**。

> 当前仓库如果保持 private，执行安装的用户/Agent 必须已经具备该 GitHub 仓库的访问权限。
>
> Continuum 已提交预编译 `dist/`，GitHub 安装不会在用户机器现场编译 TypeScript。

源码开发安装：

```bash
git clone https://github.com/yuanyi1415/Continuum.git
cd Continuum
npm install
npm run compile
npm link
continuum setup
```

更多细节见：[安装与快速开始](docs/安装与快速开始.md)。

## 5 分钟快速开始

全局 setup 完成后，进入任何 Git 项目，Codex / OMP 都会自动加载 Continuum Bridge。

未启用 Continuum 的项目不会被打扰：

```text
没有 .continuum/project.yaml
→ Global Bridge silent NOOP
```

要启用一个项目，可以直接对 Codex / OMP 说：

```text
给这个项目启用 Continuum。
```

Agent 可直接调用全局提供的 `continuum_init` Tool。也可以手工执行：

```bash
cd your-project
continuum init --name "Your Project"
```

之后仍然照常启动 Agent：

```bash
codex
# 或
omp
```

不需要项目级安装 `.codex` 或 `.omp` Adapter。

普通临时提问保持 unmanaged。正式实现通过明确意图进入，例如：

```text
implement P03
```

## 一个完整生命周期

```text
continuum init
    ↓
Change + Ticket / Spec / ADR / CONTEXT
    ↓
正式 implement <Ticket>
    ↓
Work Binding + Work Baseline
    ↓
Coding Agent 实现
    ↓
Work Reconcile
    ↓
Change Reconcile
    ↓
Snapshot 推进 / Change 关闭
    ↓
doctor
    ↓
archive
```

如果实现过程中发现设计冲突：

```text
正在实现
→ 发现设计冲突
→ 回到设计处理
→ 修改 Spec / ADR
→ 再次 implement
→ Continuum 检测相关设计已更新
→ 用户确认
→ 使用新的 Work Baseline 重新开始
```

用户不需要理解内部 BLOCK 状态机。

## 常用命令

```bash
# Project
continuum init [--name "Project Name"]
continuum status
continuum doctor [--recover]
continuum migrate

# Change / Artifact Graph
continuum change open "Change title" [--intent "..."]
continuum change list
continuum change show <change-id>
continuum artifact register <path> --type <type> [--id ID] [--change CHANGE]
continuum artifact list
continuum relation add <from> <type> <to> [--routing required|optional|historical]
continuum relation list [--for NODE]

# Work / Context / Reconcile
continuum work bind <ticket>
continuum work current
continuum matt scan [--change CHANGE]
continuum context <work>
continuum reconcile [--change CHANGE]

# Global Host / machine scope
continuum setup
continuum doctor --global
continuum host doctor

# 仅旧项目兼容 / 调试
continuum host install codex --project
continuum host install omp --project

# Archive
continuum archive
continuum archive --with-history
continuum archive verify <archive-path>
```

完整 CLI：

```bash
continuum --help
```

## 给 Coding Agent 自助安装

安装 Continuum 后，人不需要学习一整套项目初始化流程。可以直接告诉 Codex / OMP：

```text
如果本机还没完成 Continuum 全局 setup，请执行 continuum setup。
然后在当前 Git 项目启用 Continuum，检查状态；不要修改业务源码。
```

Global Bridge 给 Agent 暴露了项目操作能力：

```text
continuum_init
continuum_status
continuum_doctor
```

生命周期正确性仍由 Global Hook / Extension 保证，**不依赖 LLM 是否“想起来”调用 Tool**。Agent Tool 是自然语言便利层，Global Bridge 是机制兜底层。

更严格的 Agent 安装协议见：[Agent 自助安装](docs/Agent自助安装.md)。

## Durable State 与本地 Runtime

项目默认只需要：

```text
.continuum/          # Git-tracked Durable State
.continuum-local/    # 本机 Runtime State（gitignored）
```

Codex / OMP Bridge 位于**用户级全局目录**，不再复制进每个项目。

旧版项目若已经有：

```text
.codex/...
.omp/extensions/continuum.ts
```

仍可兼容运行；Global Bridge 会检测并让旧项目 Adapter 优先，避免同一生命周期重复执行。新项目不要再创建这些文件。

`.continuum/` 是项目可携带事实；`.continuum-local/` 是可以重建的本机 Runtime State。

## Doctor 与恢复

```bash
continuum doctor --global   # 机器级 Host Bridge
continuum doctor            # 当前项目
continuum doctor --recover
continuum migrate
continuum host doctor
```

`doctor --recover` 只自动修复**可确定推导**的 Runtime/Adapter 状态。它不会猜一个新的 Current Snapshot，也不会偷偷重写缺失的权威项目事实。

## Archive

项目完成后：

```bash
continuum archive
```

默认归档：

- Final Current Snapshot；
- Durable Continuum State；
- ADR / CONTEXT / Spec / Ticket / Evidence；
- Final Snapshot 对应的源码快照；
- Manifest + SHA256。

需要完整 Git History：

```bash
continuum archive --with-history
```

离开原仓库后仍可验证：

```bash
continuum archive verify <archive-path>
```

## 开发

```bash
npm install
npm test
npm run compile
```

当前 v1.1 回归基线：**P01–P11，74 tests**。

CI 使用 Node.js 24。

## 项目结构

```text
src/
├─ domain/        # 纯领域模型
├─ application/   # Use Cases
├─ ports/         # 稳定边界
├─ adapters/      # Git / SQLite / YAML / Host / Archive
├─ cli/           # Composition Root + CLI
└─ shared/

runtime-assets/   # Codex MCP / OMP Extension
schemas/          # Durable schemas
scripts/          # P01–P11 production verification
test/             # P01–P11 regression tests
docs/             # 设计、验收、安装说明与冻结基线
```

## 文档入口

- [安装与快速开始](docs/安装与快速开始.md)
- [Agent 自助安装](docs/Agent自助安装.md)
- [MVP 生命周期与架构](docs/MVP生命周期与架构.md)
- [P10 实现说明](docs/P10-实现说明.md)
- [P11 Global Host Integration](docs/P11-实现说明.md)
- [MVP 技术规格 v1.1.0](docs/baseline/MVP技术规格-v1.1.0/)
- [ADR-010 Global Host Integration](docs/ADR-010-Global-Host-Integration.md)
- [MVP 开发 Tickets](docs/baseline/MVP开发Tickets-v0.1/)

## License

MIT. See [LICENSE](LICENSE).
