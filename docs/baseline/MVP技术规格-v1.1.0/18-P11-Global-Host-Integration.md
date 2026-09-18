# 18｜P11 Global Host Integration 收口

## 1. Architecture Gap

P01～P10 默认把 Host Adapter 与 Project Scope 绑定：

```text
每个 repo
→ install Codex adapter
→ install OMP adapter
```

真实使用证明该模型把机器级 Integration 与项目级 Activation 混在一起。

## 2. v1.1 修正

```text
User / Machine Scope
├─ Continuum CLI
├─ Codex Global Bridge
└─ OMP Global Bridge

Project Scope
├─ .continuum/
└─ .continuum-local/
```

机器只 setup 一次；项目通过 `.continuum/project.yaml` opt-in。

## 3. Default UX

```bash
npm install -g "github:yuanyi1415/Continuum"
continuum setup
```

之后：

```text
cd any-project
codex / omp
```

Global Bridge：

```text
.continuum exists → enabled
no .continuum → silent
```

用户可直接要求 Agent “给这个项目启用 Continuum”，由 `continuum_init` Tool 执行。

## 4. Correctness

不允许把 lifecycle correctness 退化为 LLM initiative：

```text
Agent Tool → convenience
Global Hook / Extension → deterministic lifecycle mechanism
```

## 5. Compatibility

旧 repo-local Adapter 不自动破坏；Global Bridge 检测到后 defer。

新项目默认不创建 `.codex/.omp`。

## 6. Domain Impact

P11 不修改 Project / Change / Work / Snapshot / Reconcile / BLOCK / Archive Domain Model，不新增 Durable schema。

## 7. 验收基线

```text
P11: 6 / 6 PASS
P01–P11: 74 / 74 PASS
verify-p11.sh: PASS (implementation environment)
```

正式 DONE 仍以用户本机真实 Codex / OMP Production Verification 为准。
