# 07｜Context Routing 规格

## 1. 目标

不是“把项目所有知识给 Agent”，而是：

> **给当前 Work 最少且足够的权威 Context。**

---

## 2. 输入

```text
Project
Active Change
Current Work
ArtifactRefs
Relations
Host capability
```

---

## 3. 输出

```yaml
context_manifest:
  work_id:
  generated_at:
  required:
    - artifact_id:
      reason:
      priority:
  optional: []
  excluded_historical: []
```

默认返回 Manifest，不强制读取全文。

---

## 4. Relation Traversal

MVP 最大默认：

```text
2 hops
```

优先规则：

### Always Include

- target Ticket；
- parent Spec；
- `domain_context` required；
- `governed_by` ADR；
- active blocker。

### Optional

- supporting document；
- past review；
- secondary evidence。

### Exclude By Default

- historical；
- superseded；
- unrelated closed Change；
- archive。

---

## 5. Priority

建议：

```text
P0 Current Work
P1 Parent Spec / Required Domain Context
P2 Governing ADR / Blocker
P3 Optional evidence
```

---

## 6. Context Budget

MVP 不做复杂 Token Optimizer。

只提供软阈值：

```text
max_items
max_total_chars
```

超限：

- 返回 manifest truncation warning；
- 优先删除 Optional；
- 不自动总结 Authority 原文后伪装成原文。

---

## 7. Host Integration

### Codex / OMP

Adapter 可：

- 将 Manifest 转成最小 additional context；
- 或指导 Agent 按 ArtifactRef 主动读取。

避免：

```text
每次 Session Start 扫整个 docs/
```

---

## 8. 可扩展性

未来可新增：

- CodeGraph；
- Serena；
- Repo Map；
- RAG。

它们作为 Context Provider / Resolver 增强，不修改 Relation Authority。
