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
- **Host-native UX**：Codex 使用 Hook + MCP，OMP 使用项目 Extension。
- **Fail-closed**：关键 Authority、Snapshot、Schema 不明确时不猜。
- **Live ≠ Archive**：Live Project 使用 Federated Authority；Archive 是自包含物化。

## MVP v1.0 能力

| 能力 | 说明 |
|---|---|
| Project / Snapshot | 项目初始化、Current Snapshot、可移植 Durable State |
| Change / Artifact Graph | Change、ArtifactRef、Typed Relation、Authority |
| Work Binding | worktree 级正式 Work、跨 Session/Host 连续性、Work Baseline |
| Context Routing | Matt Observe/Register、Required/Optional/Historical 最小上下文 |
| Work Reconcile | Git delta、Evidence、幂等候选、Hook 丢失恢复 |
| Change Reconcile | Change 收敛、Snapshot 推进、CAS、设计/架构阻断 |
| Codex Adapter | Repo-local Hook、MCP Decision、确定性 Gate |
| OMP Adapter | Repo-local Extension、Widget、Decision/设计冲突交互 |
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

### 方式 A：直接从 GitHub 全局安装（推荐）

```bash
npm install -g git+https://github.com/yuanyi1415/Continuum.git
```

验证：

```bash
continuum --version
continuum --help
```

> 当前仓库如果保持 private，执行安装的用户/Agent 必须已经具备该 GitHub 仓库的访问权限。
>
> GitHub 安装使用仓库内已提交的 `dist/`，不会要求用户机器安装 TypeScript 或现场编译。

### 方式 B：克隆源码安装

```bash
git clone https://github.com/yuanyi1415/Continuum.git
cd Continuum
npm install
npm run build
npm link

continuum --version
```

更多细节见：[安装与快速开始](docs/安装与快速开始.md)。

## 5 分钟快速开始

进入一个**已经是 Git Repository** 的项目：

```bash
cd your-project
continuum init --name "Your Project"
```

如果你使用 Codex：

```bash
continuum host install codex
```

如果你使用 OMP：

```bash
continuum host install omp
```

检查状态：

```bash
continuum status
continuum doctor
continuum host doctor
```

之后仍然照常启动你的 Agent：

```bash
codex
# 或
omp
```

普通临时提问不会自动变成正式 Work。正式实现通过明确意图进入，例如：

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

# Host
continuum host install codex
continuum host install omp
continuum host doctor

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

如果你希望 Codex / OMP / 其他 Coding Agent 自己在当前项目完成安装，可以直接给它下面这段指令：

```text
在当前 Git 项目安装并启用 Continuum：
1. 先检查 Git 和 Node.js，Node 必须是 24 LTS；不满足就停止并告诉我，不要擅自升级系统环境。
2. 如果 continuum 命令不存在，执行：
   npm install -g git+https://github.com/yuanyi1415/Continuum.git
3. 如果当前仓库尚未存在 .continuum/project.yaml，执行 continuum init；已经初始化则不要重复 init。
4. 执行 continuum host doctor。
5. 如果检测到 Codex，执行 continuum host install codex；如果检测到 OMP，执行 continuum host install omp。
6. 执行 continuum doctor 和 continuum status。
7. 报告实际修改了哪些项目文件，以及当前 Continuum 状态。不要修改业务源码。
```

更严格的 Agent 安装协议见：[Agent 自助安装](docs/Agent自助安装.md)。

## Durable State 与本地 Runtime

项目中主要会出现：

```text
.continuum/          # Git-tracked Durable State
.continuum-local/    # 本机 Runtime State（gitignored）
.codex/              # Codex 项目适配（启用后）
.omp/extensions/     # OMP 项目适配（启用后）
```

`.continuum/` 是项目可携带事实；`.continuum-local/` 是可以重建的本机 Runtime State。

## Doctor 与恢复

```bash
continuum doctor
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
npm run build
```

当前 MVP 回归基线：**P01–P10，68 tests**。

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
scripts/          # P01–P10 production verification
test/             # P01–P10 regression tests
docs/             # 设计、验收、安装说明与冻结基线
```

## 文档入口

- [安装与快速开始](docs/安装与快速开始.md)
- [部署与运行](docs/部署与运行.md)
- [使用指南](docs/使用指南.md)
- [Agent 自助安装](docs/Agent自助安装.md)
- [MVP 生命周期与架构](docs/MVP生命周期与架构.md)
- [P10 实现说明](docs/P10-实现说明.md)
- [MVP 开发 Tickets](docs/baseline/MVP开发Tickets-v0.1/)

## License

MIT. See [LICENSE](LICENSE).
