# Continuum Agent 自助安装协议

本文件给 Codex / OMP 等 Coding Agent 阅读。

目标：

> 人主要和 Coding Agent 交互；Agent 可以调用 Continuum 完成项目操作，但生命周期正确性继续由 Global Bridge 确定性兜底。

## 1. Scope

必须区分：

```text
Machine Scope
→ Continuum CLI
→ Codex Global Bridge
→ OMP Global Bridge

Project Scope
→ .continuum/
→ .continuum-local/
```

Host Bridge 不应在每个项目重复安装。

## 2. 机器级 Setup

仅当用户明确要求安装 / 配置 Continuum，且本机尚未完成 setup 时：

```bash
node --version
git --version
continuum --version
continuum setup
continuum doctor --global
```

Node 必须为 24 LTS。

如果 `continuum` 不存在：

```bash
npm install -g "github:yuanyi1415/Continuum"
continuum setup
```

不要在业务项目里手工创建 Codex Hook 或 OMP Extension。

## 3. 项目启用

当用户明确表达：

```text
给这个项目启用 Continuum
初始化 Continuum
让这个项目进入 Continuum 管理
```

执行全局 Tool：

```text
continuum_init
```

或 CLI fallback：

```bash
continuum init --name "<project name>"
```

### Preconditions

- 当前目录必须位于 Git Repository；
- Git Repository 必须存在可作为 Initial Snapshot 的 commit；
- 已存在 `.continuum/project.yaml` 时不得重复 init。

## 4. Agent Project Tools

Global Bridge 提供最小 Tool：

```text
continuum_init
continuum_status
continuum_doctor
```

用途：

```text
用户要求启用项目 → continuum_init
用户询问项目状态 → continuum_status
用户要求诊断 / 修复 → continuum_doctor
```

不要用 Tool 自己维护另一套状态。

## 5. 生命周期正确性

Agent 不需要主动记忆所有生命周期命令。

例如：

```text
用户：implement P03
```

应由 Global Hook / Extension 的确定性生命周期路径建立 / 校验 Work Binding。

因此：

```text
Agent Tool = UX convenience
Global Bridge = correctness mechanism
```

## 6. 非 Continuum 项目

若当前项目不存在：

```text
.continuum/project.yaml
```

Global Bridge 必须 silent NOOP。

不得因为 Continuum 已全局安装就自动初始化所有 Repository。

## 7. 禁止行为

不要：

```text
未经用户明确要求自动 continuum init
每个项目重复 host install
手工伪造 .continuum 状态
手写 runtime.db
rm -rf .continuum
通过 Prompt / AGENTS.md 代替 Global Bridge
替用户自动选择 DECISION / BLOCK 选项
```

## 8. 旧项目

如果项目已经存在 repo-local Continuum Adapter：

```text
.codex/...
.omp/extensions/continuum.ts
```

不要同时再制造第二套项目 Adapter。

Global Bridge 会主动 defer；如需迁移 / 清理旧 Adapter，应先让用户确认并保留 Durable `.continuum/` 状态。

## 9. 完成报告

项目启用完成后报告：

```text
Continuum 已为当前项目启用。

CLI: <version>
Project: <project id / name>
Global Host: <Codex / OMP / both / none>
Global Doctor: PASS / WARN / FAIL
Project Doctor: PASS / WARN / FAIL
Current Snapshot: <snapshot id>
Managed Work: <ticket or none>

项目状态：
- .continuum/ 已存在
- .continuum-local/ 本地 Runtime
- 未新增项目级 .codex / .omp Adapter
```
