# Continuum Repository Agent Guide

## Product

Continuum is a local-first project lifecycle control plane for long-running AI coding work.

P01–P10 established the lifecycle MVP. P11 changes the default Host Integration architecture from repo-local adapters to user-level Global Bridges. Do not reinterpret Continuum as a chat wrapper, workflow builder, daemon service, or Docker-first platform.

## Architecture invariants

- `domain/` depends on no outer layer.
- `application/` depends only on Domain + Ports.
- `adapters/` implement Ports and own unstable integration details.
- `cli/` is the composition root.
- Host SDK, Git CLI, filesystem, YAML and SQLite must not leak into Domain.
- Durable project state lives under `.continuum/` in user projects.
- Runtime state lives under `.continuum-local/` and is rebuildable.
- Host integration is user/machine scope by default.
- Project activation remains project-scoped and opt-in via `.continuum/project.yaml`.
- Critical lifecycle correctness must not depend solely on LLM initiative.
- Agent-facing Continuum tools are convenience surfaces; Global Bridges are correctness mechanisms.
- Live Project uses federated authority; Archive is self-contained materialization.

## Global Host Integration

Normal machine setup:

```bash
continuum setup
continuum doctor --global
```

New projects must not receive repo-local `.codex` / `.omp` adapters by default.

Legacy project adapter compatibility is allowed only to avoid breaking existing projects. Global Bridges must defer when a legacy local adapter is detected.

## Change control

Stop and raise an architecture gap before introducing:

- a new durable project-state concept;
- a change in Project / Change / Work / Snapshot authority;
- an LLM-dependent correctness requirement;
- a new Host Interaction semantic that bypasses Core;
- automatic repair of ambiguous Durable Authority;
- automatic activation of repositories that have not opted into Continuum.

## Development

Required runtime: Node.js 24 LTS.

```bash
npm install
npm test
npm run compile
```

All P01–P11 regressions must remain green.

## Installing / enabling Continuum

Read `docs/Agent自助安装.md`.

Do not manually create Host hooks/extensions when `continuum setup` exists. Do not repeat Host setup per project.
