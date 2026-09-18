# P05｜Work Reconcile 正确性闭环

## 目标

让任何 Host 即使 Hook 丢失，也能可靠回答：

> “从正式开始做这个 Work 到现在，真实发生了什么？”

## 范围

实现：

- LifecycleSignal normalization；
- stable checkpoint Application API；
- Work Baseline → Current Revision；
- changed files / diff；
- EvidencePort 基线；
- pending Work Reconcile；
- idempotency；
- duplicate event dedupe；
- lost-hook recovery；
- Generic post-commit fallback；
- N0～N4 internal result model；
- AUTO / PROPOSE / STOP mapping。

## 必须通过的回归

1. 绑定前改动不进入当前 Work；
2. 绑定后无改动 → NOOP；
3. 一个 commit → 一个 pending candidate；
4. 多 commit → 更新同一个 candidate；
5. Stop + SessionEnd + post-commit → 不重复；
6. 删除 event history → `reconcile/status` 仍能发现未收敛变化；
7. Evidence UNKNOWN 不得视为 PASS。

## 不做

- 推进 Project Snapshot；
- Host-specific UI。

## 依赖

P03。

P04 可并行，但最终 P06 需要两者。
