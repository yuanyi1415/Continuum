# Ticket 执行规则

## 开发入口

每个 Ticket 开始前必须：

1. 读取 `Continuum-MVP技术规格-v1.0.0` 中对应章节；
2. 读取该 Ticket；
3. 确认上游依赖已满足；
4. 先写验收测试 / Contract Test，再实现。

## Architecture Gap

实现过程中若发现：

- 需要新增长期状态；
- 需要修改 Authority；
- 需要改变 Change / Work / Snapshot 语义；
- 需要让 LLM 承担新的 correctness；
- 需要改变 Host Interaction Contract；

立即停止当前 Ticket。

```text
Architecture Gap
→ ADR / Spec
→ 评审
→ 更新 Ticket
```

不得在实现中静默决定。

## Ticket Done

Done 必须同时满足：

- acceptance journey 通过；
- unit / contract / integration test 通过；
- 与上游 Spec 一致；
- 无未登记 architecture gap；
- 无无关重构；
- code review 通过。
