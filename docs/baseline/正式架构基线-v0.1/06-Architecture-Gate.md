# 06｜Architecture Gate

进入 MVP Spec 前必须回答以下问题。

---

## A. 架构边界

- [x] Continuum 是 Project Control Plane，不是 Coding Runtime
- [x] Core 与 Host Adapter 分离
- [x] Matt 保持黑盒主流程
- [x] Authority 是 Federated
- [x] Project State Authority 属于 Continuum

---

## B. State

- [x] Durable / Ephemeral 分离
- [x] Worktree / Session 分离
- [x] Project Baseline / Work Baseline 分离
- [x] Ticket Reconcile / Change Reconcile 分离
- [ ] Durable Storage Format 正式 ADR
- [ ] Runtime Storage Format 正式 ADR
- [ ] Schema Migration 策略正式 ADR

---

## C. Lifecycle

- [x] Lifecycle correctness state-derived
- [x] Host events only wake system
- [x] lost-hook 可恢复
- [x] Work Intent 建立 Binding
- [x] Change Reconcile 推进 Snapshot
- [ ] Change lifecycle state machine 正式冻结

---

## D. Interaction

- [x] Interaction 统一四类
- [x] Codex default silent
- [x] Codex MCP-first decision
- [x] OMP single ambient widget
- [x] simple decision / heavy decision 分层
- [ ] Interaction Schema 正式冻结
- [ ] Headless fallback contract 正式冻结

---

## E. Integration

- [x] Codex lifecycle E2E 验证
- [x] OMP lifecycle E2E 验证
- [x] cross-agent continuity E2E 验证
- [ ] Matt artifact detection contract 正式设计
- [ ] Generic Agent minimum contract 正式设计

---

## F. Archive

- [x] Live Project 使用 Federated Authority
- [x] Final Archive 需要 self-contained materialization
- [ ] MVP Archive manifest / materialization scope 正式设计

---

## Gate 结论

当前已经具备正式 Architecture 设计基础。

但在进入实现 Ticket 前，应至少完成：

1. Storage ADR；
2. Change State Machine；
3. Interaction Schema；
4. Matt Adapter Contract；
5. Archive 最小边界。

之后再进入 MVP Spec。
