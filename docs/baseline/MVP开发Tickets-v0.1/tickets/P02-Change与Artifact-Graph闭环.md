# P02｜Change 与 Artifact Graph 闭环

## 目标

让 Continuum 第一次能表达：

> “项目正在正式改变什么，这个 Change 与哪些外部 Artifact 有关系。”

## 范围

实现：

- Change `active / closed / superseded` Domain；
- ArtifactRef；
- Relation；
- YAML persistence；
- `continuum change open`；
- Change query/status；
- internal register artifact / relation Application API；
- CLI debug/admin surface 可用于 fixture 验证；
- local Git-backed ArtifactAuthority 初版。

## 验收 Journey

```text
continuum change open "用户 Memory"
→ CHANGE active

register SPEC-001
register P01/P02/P03
→ belongs_to relations

continuum status
→ active change = 用户 Memory
```

验证：

- 不能 `closed → active`；
- 不能 `superseded → active`；
- historical relation 默认可被识别为非当前路由；
- ArtifactRef 不复制正文作为 Authority。

## 不做

- 自动识别 Matt；
- Context Routing；
- Work Binding。

## 依赖

P01。
