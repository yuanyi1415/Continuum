# P04｜Matt Artifact 接入与最小 Context Routing

## 目标

保持 Matt 黑盒的同时，让 Continuum 能知道：

```text
Change
→ Spec
→ Ticket
→ Context / ADR
```

并为当前 Work 返回最小 Context Manifest。

## 范围

实现：

- Matt Adapter Contract；
- local Matt artifact detector / observer；
- Spec / Ticket / CONTEXT / ADR ArtifactRef；
- typed relation registration；
- Context Router；
- Required / Optional / Historical；
- 默认 2-hop traversal；
- `continuum context [work] [--json]`。

## 验收 Journey

给定 fixture：

```text
CHANGE-001
SPEC-001
P03
CONTEXT.md
ADR-002
historical-spec
optional-evidence
```

`continuum context P03` 必须：

- 包含 P03；
- 包含 SPEC-001；
- 包含 required CONTEXT；
- 包含 governing ADR；
- 排除 historical；
- optional 不默认强制读取；
- 不扫描整个 docs。

## 不做

- RAG；
- Vector DB；
- CodeGraph integration。

## 依赖

P03。
