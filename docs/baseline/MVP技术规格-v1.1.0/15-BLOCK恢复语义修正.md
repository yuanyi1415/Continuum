# 15｜设计冲突暂停与重新开始语义

## 1. 用户语义

内部仍保留 `BLOCK / blockPhase / resolved` 状态机，但正常用户不接触这些术语。

用户只看到：

```text
发现设计冲突
→ 回到设计处理
→ 设计已经更新 / 尚未更新
→ 重新开始原 Work
```

---

## 2. 发现设计冲突

当实现结果表明当前 Spec / ADR 的核心假设无法成立：

```text
P03 暂停实现：发现设计冲突
```

继续实现不得绕过。

用户可以选择：

```text
回到设计处理
```

这个动作：

- 释放当前 Work Binding；
- Change 保持 `active`；
- 设计冲突保持未解决；
- Session 恢复正常设计 / 研究 / Spec 修改能力。

---

## 3. Design Artifact Baseline

产生设计冲突时，Continuum 必须记录相关设计 Authority 在阻断时的 committed version：

```yaml
design_artifacts:
  - artifact_id: SPEC-001
    type: spec
    version: <git blob at blocked revision>
  - artifact_id: ADR-003
    type: adr
    version: <git blob at blocked revision>
```

版本必须来自对应 Git revision，而不是未提交工作树内容。

---

## 4. 再次开始 Work

用户再次：

```text
implement P03
```

Continuum 比较当前 committed Spec / ADR version 与 Design Artifact Baseline。

### 没有相关设计变化

显示：

```text
P03 还不能继续

上次发现的设计冲突尚未检测到相关 Spec / ADR 更新。
请继续处理设计，完成并提交设计变更后，再次开始 P03。
```

不暴露 `BLOCKED / resolve-block / blockPhase`。

### 已有相关设计变化

产生 `DECISION`：

```text
检测到相关设计已更新

是否基于最新设计重新开始 P03？

[重新开始 P03]
[继续调整设计]
```

不能因为文件变化就自动认为设计问题已经解决。

---

## 5. 用户确认重新开始

选择：

```text
重新开始 P03
```

是显式语义确认。系统一次性执行：

```text
resolve old design conflict
→ create new Work Binding
→ freeze new work_start_revision at current committed design revision
→ enter managed implementation
```

若重新绑定失败，旧设计冲突必须恢复为 pending，禁止留下半完成状态。

---

## 6. Host UX

### Codex

- 发现冲突：Hook Block，使用用户语言说明原因；
- 设计已更新：MCP Elicitation 询问是否重新开始；
- 默认静默，不显示内部 blocker 状态。

### OMP

- 发现冲突：Overlay 提供“回到设计处理”；
- 设计未更新：轻量提示“P03 还不能继续”；
- 设计已更新：原生 `select()` 提供“重新开始 / 继续调整设计”；
- 重新开始后恢复单一 Managed Work Widget。

---

## 7. Fallback

底层 CLI 可保留 BLOCK 调试 / 恢复命令，但不作为正常 Codex / OMP 用户工作流。
