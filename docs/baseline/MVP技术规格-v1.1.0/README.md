# Continuum MVP 技术规格 v1.1.0

本包在 v1.0.6 生命周期闭环基础上，加入 P11 Global Host Integration Architecture Correction。

建议阅读顺序：

1. `00-规格说明.md`
2. `01-MVP范围与技术选型.md`
3. `02-模块分层与工程结构.md`
4. `03-领域模型与不变量.md`
5. `04-Durable与Runtime存储设计.md`
6. `06-生命周期与Reconcile规格.md`
7. `08-Host-Adapter与交互规格.md`
8. `09-CLI与MCP接口.md`
9. `12-测试策略与验收标准.md`
10. `14-定稿技术决策.md`
11. `18-P11-Global-Host-Integration.md`

v1.1 核心修正：

```text
Global Host Bridge = User / Machine Scope
Continuum Project = Project Scope
Agent-driven UX + Mechanism-driven correctness
```

机器实现参考仍为：

- `interfaces/`
- `schemas/`
- `sql/runtime.sql`
- `spec.yaml`

P11 不修改 Durable Domain Schema。
