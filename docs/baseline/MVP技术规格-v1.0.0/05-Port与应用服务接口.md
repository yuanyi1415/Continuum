# 05｜Port 与应用服务接口

本 Spec 的 TypeScript 参考接口见：

- `interfaces/domain.ts`
- `interfaces/ports.ts`

---

## 1. ProjectStorePort

职责：

- Durable Project State；
- Atomic durable write；
- optimistic current advancement。

核心：

```text
loadProject
loadCurrentSnapshot
saveSnapshot
advanceCurrent
loadChange
saveChange
saveArtifact
saveRelation
saveChangeReconcile
```

---

## 2. RuntimeStorePort

职责：

- Worktree Binding；
- Session Binding / Suppression；
- Pending Reconcile；
- Pending Interaction；
- idempotency / cursor。

Core 不允许直接访问 SQLite。

---

## 3. GitPort

职责：

```text
getRepositoryIdentity
getWorktreeIdentity
getCurrentRevision
getChangedFiles
getDiff
isDirty
```

要求：

- 返回 normalized data；
- 不把 Git CLI stderr 直接泄漏给 Domain；
- Revision 必须完整 SHA。

---

## 4. ArtifactAuthorityPort

统一解析外部事实：

```text
resolve(ref)
exists(ref)
version(ref)
materialize(ref, destination)
```

MVP 支持优先级：

1. local Git-backed file；
2. GitHub Issue / remote tracker（可选）；
3. 后续 provider。

---

## 5. EvidencePort

职责：

```text
collectTests(work)
collectReview(work)
verifyCompletion(work)
```

必须区分：

```text
PASS
FAIL
UNKNOWN
```

不能将 UNKNOWN 当 PASS。

---

## 6. InteractionRenderer

```text
renderStatus
renderNotice
requestDecision
renderBlock
```

Application 只依赖统一 Interaction Contract。

---

## 7. Application Use Cases

### InitProject

输入：

```text
cwd
name?
```

输出：

```text
Project
Initial Snapshot
Host install recommendations
```

### OpenChange

输入：

```text
title
intent
```

规则：

- 默认 `active`；
- 不自动创建 Spec；
- 返回 Change ID。

### BindWork

输入：

```text
target ArtifactRef
worktree
session
```

行为：

- 验证唯一归属；
- 冻结 Git HEAD 作为 Work Baseline；
- 保存 Worktree Binding。

### HandleLifecycleSignal

只负责：

```text
normalize
gate
derive
dispatch use case
```

不得直接更新 Snapshot。

### ReconcileWork

只写 Runtime Pending Candidate / interaction proposal。

### ReconcileChange

唯一可以：

```text
create durable reconcile
create new snapshot
advance current
close change
```

### RouteContext

返回：

```text
ordered artifact manifest
```

而不是强制把所有正文拼成一个大 prompt。
