# 05｜Spike 验证结论与冻结事实

本文件只记录最终通过验证的结论，不保留已被推翻的中间方案作为当前事实。

---

## 1. Minimal Project State

结论：**SUPPORTED**

最小 Snapshot 可收敛为：

```yaml
project_id:
snapshot_id:
created_at:
baselines:
  - repository:
    revision:
stage:
active_changes: []
blockers: []
next_gate:
last_reconcile:
```

不把所有 ADR / Ticket / Context 全塞进 Snapshot。

---

## 2. Artifact Authority

结论：**SUPPORTED**

最终模型：

> Federated Authority + ArtifactRef / Relation Index

不是：

> Continuum 复制所有 Artifact 正文。

---

## 3. Matt Black-box Integration

结论：**SUPPORTED WITH CONSTRAINTS**

冻结约束：

- 不 fork Matt；
- 不要求 Matt Skill 主动维护 Continuum；
- Continuum 从 lifecycle / artifact / authority 变化建立索引；
- 生命周期正确性不依赖 Skill 自觉。

---

## 4. Reconcile

结论：**SUPPORTED**

历史样本验证了：

- Implementation-only；
- Project-state；
- Domain change；
- Architecture decision；
- Design/scope gap；

可以被统一收敛为不同 Knowledge Impact。

---

## 5. Context Routing

结论：**SUPPORTED WITH TYPED RELATIONS**

真实历史样本中，通过关系路由将原本约：

```text
164 个 Markdown
≈ 1,541,864 chars
```

缩减到约：

```text
5 个 Required Artifact
≈ 40,912 chars
```

文本规模下降约：

```text
97.35%
```

因此 MVP 暂无必要引入 RAG。

---

## 6. Repo Portability

结论：**SUPPORTED**

`.continuum` 不进入 Repo：

```text
clone → Project State 丢失
```

进入 Repo 后：

```text
clone → status/context 保持一致
```

冻结：

> Durable Project State 必须 repo-native。

---

## 7. Parallel Worktree

结论：**SUPPORTED AFTER MODEL CORRECTION**

单一可变 `state.yaml` 会形成 merge hotspot。

冻结：

- Ticket 不推进 Global Snapshot；
- Change Reconcile 才推进 Current；
- durable state 采用 immutable / append-friendly 思路；
- runtime candidate 留在 local state。

---

## 8. Lifecycle Trigger

结论：**SUPPORTED**

验证路径：

```text
Pi/OMP-style native event
OpenCode-style plugin event
Generic Git Hook
Lost Hook Recovery
```

最终都能收敛到相同 lifecycle facts。

冻结：

> **Hooks are wake-up signals, not truth.**

---

## 9. Lost Hook Recovery

结论：**SUPPORTED**

即使 lifecycle event 丢失：

```text
Snapshot Baseline
vs
Git HEAD
vs
Reconciled Revision
```

仍可重新发现 pending reconcile。

---

## 10. Ticket Reconcile Persistence

结论：**CORRECTED**

已排除：

- 每 Ticket 自动第二个 Git commit；
- Git Notes 作为默认方案；
- 每 Commit 一个 Durable Ticket Record。

最终冻结：

> Ticket Reconcile = ephemeral process  
> Change Reconcile = durable convergence boundary

---

## 11. Cross-Agent Continuity

结论：**REAL E2E PASSED**

真实环境：

```text
Codex CLI 0.154.0
Oh My Pi 18.2.1
```

真实 E2E 最终通过：

- Ad-hoc 不误绑定；
- Codex `implement P03` 自动绑定；
- Work Baseline 正确冻结；
- OMP 新 Session 自动 resume；
- Git commit 生成单一 P03 candidate；
- 新 Codex Session 再次 resume；
- lifecycle checkpoint 幂等。

---

## 12. Project Baseline vs Work Baseline

结论：**SUPPORTED AFTER REAL E2E CORRECTION**

曾出现：

> Ticket 把绑定前的 Adapter / AGENTS 改动误算进当前 Work。

修正后冻结：

```text
Project Snapshot Baseline
≠
Work Baseline
```

Ticket Reconcile：

```text
Work Baseline → Current Revision
```

---

## 13. Host UX｜Codex

结论：**SUPPORTED**

真实 UX Spike：

- Session STATUS：弱；
- Hook Gate：可用但产品感一般；
- MCP Elicitation：最佳；
- BLOCK：Hook 可满足 correctness。

冻结：

```text
Codex
→ default silent
→ MCP-first DECISION
→ Hook fallback / BLOCK
```

---

## 14. Host UX｜OMP

结论：**SUPPORTED**

真实截图进一步证明：

- Status line 容易被 OMP 其它状态淹没；
- Widget 更适合作为 Managed Work Ambient Anchor；
- 同时显示 Widget + Status + Action Line 会产生明显重复。

冻结：

> **Single Ambient Widget**

```text
Normal:
Continuum · 用户 Memory / P03

Action:
Continuum · 用户 Memory / P03 · 需要决策
```

其它内容用：

- notify；
- select；
- overlay；

按需出现。

---

## 15. 前期 Unknown 状态

| Unknown | 状态 |
|---|---|
| Minimal Project State | 已验证 |
| Artifact Authority | 已验证 |
| Matt Integration | 已验证，有约束 |
| Reconcile | 已验证 |
| Explicit Context Routing | 已验证 |
| Agent Lifecycle Trigger | 已验证 |
| Cross-Agent Continuity | 已验证 |
| Host Interaction UX | 已验证 |
| Personal Knowledge Extraction | 延后 Phase 2 |

结论：

> **正式建设前的核心架构 Unknown 已基本消除。**
