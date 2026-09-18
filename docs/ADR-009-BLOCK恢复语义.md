# ADR-009｜BLOCK 恢复语义

**状态**：Accepted

## Context

P08 真实 OMP TUI 验收发现：旧实现将 pending `BLOCK` 作为所有输入的全局门禁。用户关闭 Overlay 后，下一次输入仍被再次拦截，导致整个 Agent Session 实际被锁死。

这违反了 Continuum 的原始意图：

> BLOCK 应阻止不安全的正式实现继续推进，而不是阻止用户讨论、研究、修改 Spec 或退出 Session。

## Decision

`BLOCK` 的正式语义冻结为：

```text
Managed Work
    ↓ N4 / Design Gap
BLOCK active
    ↓ Return To Design
Project-aware / Change remains active
    ↓ Design / Spec conflict fixed
Explicit Resolve Block
    ↓
Formal Work may bind again
```

### BLOCK Phase

BLOCK 必须把恢复阶段作为 Core Runtime Fact，而不是由 Host UI 根据 Work Binding 推断：

```text
blockPhase=implementation
→ ReturnToDesign
→ blockPhase=design
→ ResolveBlock
→ resolved
```

Host Renderer 只能读取该阶段，不得自行推断“是否可解除”。

### Return To Design

- 释放当前 worktree 的 Work Binding；
- 清理该 Work 的 ephemeral pending reconcile；
- 清理对应 session binding；
- Change 保持 `active`；
- BLOCK interaction 保持 unresolved，并持久化 `blockPhase=design`；
- 普通设计 / 研究 / Spec 工作可以继续。

### Unresolved BLOCK

- 不能重新 bind 受影响 Change / Ticket；
- `continuum-off` 不能在当前 blocked managed work 上作为绕过方式；
- `/quit`、help、status 等 Host 控制能力必须仍然可用。

### Resolve Block

- 只能由显式用户动作执行；
- BLOCK 必须已经进入 `blockPhase=design`；
- 当前 worktree 必须已经退出 Managed Work；
- resolve 后才允许重新 bind formal Work。

## Consequences

- BLOCK 不再锁死整个 Agent Session；
- OMP 不再使用全局 `input` gate 拦截所有输入；
- Codex / OMP / Generic CLI 共用同一 Core 语义；
- BLOCK Resolution 属于 project lifecycle correctness，不属于 Host UI 特例。


## OMP 18.2.1 Host UX Constraint

OMP 的非 tool-call Extension handler 存在固定 watchdog。BLOCK 的第二阶段解除不得依赖 `before_agent_start` 中长时间等待用户选择。

冻结：

```text
implementation BLOCK
→ Host Overlay 可返回设计
→ Core blockPhase=design
→ 设计/Spec 修复完成
→ 用户显式 /continuum-resolve-block
→ Core ResolveBlock
```

命令调用本身即为显式确认，不再叠加二次 selector。

## v0.9 用户交互修正

内部 BLOCK 状态不再直接暴露给普通用户。Host UI 统一翻译为：

```text
发现设计冲突
→ 回到设计处理
→ 设计尚未更新 / 设计已更新
→ 重新开始 Work
```

ReturnToDesign 后，Continuum 记录阻断时相关 Spec / ADR / Domain Context 的 committed artifact versions。下一次显式 implement intent 会比较当前 committed versions：

- 未变化：继续暂停实现，仅提示设计尚未处理；
- 已变化：产生 restart decision；
- 用户确认 restart：resolve 原设计冲突，并以当前 Git revision 冻结新的 Work Baseline；
- 用户选择继续设计：保持冲突未解决，不建立 Work。

文件变化本身不等于问题解决，必须保留一次用户语义确认。
