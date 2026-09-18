# Continuum Agent 自助安装协议

本文件给 Coding Agent 阅读。目标是让 Agent 能确定性地把 Continuum 安装到当前项目，而不是凭模型猜测项目状态。

## 安装边界

Agent 必须遵守：

1. 只在用户明确要求启用 Continuum 的项目执行；
2. 当前目录必须是 Git Repository；
3. Node.js 必须为 24 LTS；
4. 已存在 `.continuum/project.yaml` 时不得重复 `continuum init`；
5. 不得删除或重建用户已有 `.continuum/` Durable State；
6. Host Adapter 通过 `continuum host install ...` 安装，不手写替代配置；
7. 最后必须执行 `continuum doctor` 和 `continuum status`；
8. 安装过程不得修改业务源码。

## 确定性安装步骤

```bash
# 1. 环境
pwd
git rev-parse --show-toplevel
node --version
git --version

# 2. 安装 CLI（仅当 command -v continuum 失败）
TMP_DIR="$(mktemp -d)"
git clone --depth 1 git@github.com:yuanyi1415/Continuum.git "$TMP_DIR/Continuum"
bash "$TMP_DIR/Continuum/install.sh"
rm -rf "$TMP_DIR"

# 3. 验证
continuum --version

# 4. Project Init（仅当 .continuum/project.yaml 不存在）
continuum init

# 5. Host 诊断
continuum host doctor

# 6. 按实际存在 Host 安装
continuum host install codex
# 或
continuum host install omp

# 7. 收口检查
continuum doctor
continuum status
```

## Agent 可直接执行的判断逻辑

```text
不是 Git Repo
→ STOP

Node != 24.x
→ STOP，报告环境不满足

continuum 不存在
→ clone 到临时目录
→ bash install.sh
→ 删除临时目录

.continuum/project.yaml 不存在
→ continuum init

已经存在
→ 不重复 init

Codex 可用
→ continuum host install codex

OMP 可用
→ continuum host install omp

最后
→ continuum doctor
→ continuum status
→ 报告变更
```

## 禁止行为

不要：

```text
rm -rf .continuum
rm -rf .continuum-local   # 除非 doctor/recovery 明确要求且用户允许
手写 runtime.db
手工伪造 Snapshot / Change / Work
通过修改 AGENTS.md 代替 host install
在非项目目录执行 init
```

## 安装完成后的用户报告模板

```text
Continuum 已启用。

CLI: <version>
Project: <project id / name>
Host: <Codex / OMP / both / none>
Doctor: PASS / WARN / FAIL
Current Snapshot: <snapshot id>
Managed Work: <ticket or none>

项目新增/更新：
- .continuum/...
- .codex/...（如启用 Codex）
- .omp/extensions/...（如启用 OMP）

未修改业务源码。
```
