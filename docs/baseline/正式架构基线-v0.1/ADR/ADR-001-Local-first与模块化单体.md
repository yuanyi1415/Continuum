# ADR-001｜Local-first 与模块化单体

**状态**：Proposed

## Context

Continuum 面向个人本地 AI Coding 项目，MVP 要求：

- 无后台服务；
- 无外部数据库依赖；
- clone 可继续；
- Codex / OMP / Generic Agent 共用；
- Core 不绑定宿主。

## Decision

候选决策：

> Continuum MVP 采用 **Local-first Modular Monolith**。

逻辑上分 Domain / Application / Ports / Adapters，但部署上保持：

```text
一个 Core
+
一个 CLI
+
若干 Host Adapter
```

## Consequences

优点：

- 安装简单；
- 调试简单；
- 本地可用；
- 不提前引入分布式复杂度。

代价：

- 后续云端协作能力需要新增同步层；
- 当前不解决多人远程共享 Runtime State。
