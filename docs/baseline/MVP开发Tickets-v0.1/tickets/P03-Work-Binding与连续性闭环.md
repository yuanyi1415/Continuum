# P03｜Work Binding 与跨 Session 连续性闭环

## 目标

建立 Continuum 最重要的 Runtime 边界：

```text
正式进入 P03
→ freeze Work Baseline
→ worktree owns continuity
→ new Session can resume
→ session suppression does not destroy work
```

## 范围

实现：

- Work Binding Domain；
- Worktree identity；
- `work_start_revision`；
- Runtime tables；
- `continuum work bind <ticket>` fallback；
- `continuum work current`；
- Session Binding；
- Session Suppression；
- Project Status 显示 managed work；
- Generic resume API。

## 验收 Journey

1. Change 下存在 P03；
2. 当前 HEAD = A；
3. bind P03；
4. `work_start_revision = A`；
5. commit B；
6. 新 Session 读取同一个 worktree；
7. 自动得到 P03；
8. suppress Session；
9. 当前 Session 变 unmanaged；
10. 新 Session 仍恢复 P03。

## 不变量

- Resume 不改变 Work Baseline；
- 一个 worktree 同时最多一个 formal Work；
- suppression 不删除 worktree binding。

## 依赖

P02。
